import { Router, Request, Response } from 'express';
import { crmStore } from '../services/crmStore';
import { brandVoiceService } from '../services/brandVoiceService';
import { deepseekService } from '../services/deepseekService';
import { runAgentTurn } from '../services/agentLoop';
import { buildChatSystemPrompt } from '../services/chatPrompt';
import { toolDispatcher } from '../tools/dispatcher';
import { VOICE_AGENT_TOOLS } from '../tools/registry';
import { complianceService } from '../services/complianceService';
import { createOptionalUser, OptionalAuthedRequest } from '../middleware/optionalUser';
import { workspaceService } from '../services/workspaceService';
import { workspaceKeysService } from '../services/workspaceKeysService';
import { isDatabaseConfigured } from '../db/client';
import { randomUUID } from 'crypto';
import { resolveCallAttribution, checkEntitlement, hasServerKeyAccess } from '../services/usageService';
import { signCallToken, isCallTokenConfigured } from '../services/callTokenService';

export const tokenRouter = Router();

// Anonymous callers keep working exactly as before; a signed-in caller gets
// their own saved key used instead of the server's.
const optionalUser = createOptionalUser({
  authBaseUrl: process.env.NEON_AUTH_BASE_URL,
  workspaces: workspaceService,
  storageReady: isDatabaseConfigured
});

const MAX_SESSION_SECONDS = 3600;

/**
 * Anonymous and unattributed calls run on the server's key with nobody accountable
 * for the minutes, so their sessions are short. Long enough to try the demo, short
 * enough that a script minting tokens in a loop cannot run up hour-long sessions.
 */
function anonymousSessionSeconds(): number {
  const configured = Number(process.env.ANON_MAX_SESSION_SECONDS);
  return Math.min(MAX_SESSION_SECONDS, Math.max(60, Number.isFinite(configured) && configured > 0 ? configured : 300));
}

interface MeteringDecision {
  /** Set when the caller has no minutes left. The mint must not happen. */
  refusal?: { error: string; code: 'MINUTES_EXHAUSTED'; minutesUsed: number; minutesLimit: number };
  maxSessionSeconds: number;
  callId?: string;
  callToken?: string;
  warning?: 'MINUTES_LOW';
  minutesRemaining?: number;
}

/**
 * Attribute the call and check the allowance. Fails OPEN on anything except a
 * genuinely exhausted allowance: metering is bookkeeping, and a database blip,
 * an unset CALL_TOKEN_SECRET or an unmapped tenant must never take voice down.
 * The cost of failing open is an unbilled call, which is recoverable; the cost
 * of failing closed is a dead product.
 */
async function prepareMetering(
  req: Request,
  authed: OptionalAuthedRequest,
  usingOwnKey: boolean
): Promise<MeteringDecision> {
  const open: MeteringDecision = { maxSessionSeconds: MAX_SESSION_SECONDS };
  if (!isDatabaseConfigured()) return open;

  try {
    const siteKey = typeof req.body?.siteKey === 'string' ? req.body.siteKey : null;
    // A site key marks a widget call. data-company is deliberately not consulted:
    // any page can send it, and it used to decide whose minutes were spent.
    const attribution = await resolveCallAttribution({
      channel: siteKey ? 'widget' : 'console',
      workspaceTenantId: authed.workspace?.tenantId ?? null,
      siteKey,
      origin: req.header('origin') ?? null
    });
    if (!attribution) return open;

    let maxSessionSeconds = MAX_SESSION_SECONDS;
    let warning: 'MINUTES_LOW' | undefined;
    let minutesRemaining: number | undefined;
    let billable = attribution.billable;

    if (attribution.source === 'console_anon' || attribution.source === 'widget_unattributed') {
      maxSessionSeconds = Math.min(maxSessionSeconds, anonymousSessionSeconds());
    }

    // There are no free credits for clients. A workspace either brings its own key,
    // in which case they pay AssemblyAI directly and our allowance is not theirs to
    // draw down, or the owner has granted it the server's key. Everything else runs
    // against a paid subscription or is refused.
    let gated = billable;
    if (billable && usingOwnKey) {
      billable = false;
      gated = false;
    } else if (billable && (await hasServerKeyAccess(attribution.tenantId))) {
      gated = false;
    }

    if (gated) {
      const ent = await checkEntitlement(attribution.tenantId);
      if (ent.metered !== false && !ent.allowed) {
        return {
          maxSessionSeconds,
          refusal: {
            error: 'Voice minutes are used up for this billing period.',
            code: 'MINUTES_EXHAUSTED',
            minutesUsed: ent.minutesUsed,
            minutesLimit: ent.minutesLimit
          }
        };
      }
      if (ent.metered !== false) {
        maxSessionSeconds = Math.min(MAX_SESSION_SECONDS, ent.maxSessionSeconds);
        warning = ent.warning;
        minutesRemaining = ent.minutesRemaining;
      }
    }

    if (!isCallTokenConfigured()) return { ...open, maxSessionSeconds, warning, minutesRemaining };

    const callId = randomUUID();
    const { token } = signCallToken({
      callId,
      tenantId: attribution.tenantId,
      source: attribution.source,
      billable,
      maxSessionSeconds
    });
    return { maxSessionSeconds, callId, callToken: token, warning, minutesRemaining };
  } catch (err: any) {
    // Name only: never err.message, which can carry query text.
    console.warn('[Token Route] Metering unavailable, minting unmetered:', err?.name);
    return open;
  }
}

tokenRouter.post('/token', optionalUser, async (req: Request, res: Response) => {
  const authed = req as OptionalAuthedRequest;
  let apiKey = process.env.ASSEMBLYAI_API_KEY;
  // True only when the caller's own saved key is what will be minted with.
  let usingOwnKey = false;

  if (authed.workspace) {
    // Fail open, like optionalUser itself: the key store throws when storage or
    // MASTER_KEY is unavailable, and a signed-in caller must not lose voice
    // (or hang on an unhandled rejection) because of it.
    try {
      const secrets = await workspaceKeysService.getSecrets(authed.workspace.tenantId, 'assemblyai');
      if (secrets?.apiKey) {
        apiKey = secrets.apiKey;
        usingOwnKey = true;
      }
    } catch (err: any) {
      // Name and cause code only, never err.message: a JSON.parse failure after a
      // bad decrypt embeds decrypted plaintext in the message (see requireUser).
      console.warn('[Token Route] Could not read the caller BYOK key, using the server key:', err?.name, err?.cause?.code ?? '');
    }
  }

  if (!apiKey) {
    // Fail loudly. This used to return 200 with a fake `demo_token_...`, and the
    // client would then point its "voice" WebSocket at our own /ws/telemetry
    // endpoint while the UI printed "Voice session authenticated". The visitor
    // spoke, nothing listened, and nobody could tell. A voice product that
    // cannot do voice must say so.
    return res.status(503).json({
      error: 'Voice is not configured on this server.',
      code: 'VOICE_UNCONFIGURED',
      isDemo: true,
      message: 'Set ASSEMBLYAI_API_KEY to enable live voice sessions.'
    });
  }

  // Decide whose minutes this call spends, and whether they have any left, BEFORE
  // minting: a refused mint costs nothing, a minted one spends AssemblyAI money.
  // This is the only point where usage can actually be enforced. The browser talks
  // to AssemblyAI directly with the token, so there is no mid-call cutoff without
  // proxying audio. What we can do is refuse here and cap the session length so
  // the vendor ends it: max_session_duration_seconds below.
  const metering = await prepareMetering(req, authed, usingOwnKey);
  if (metering.refusal) {
    return res.status(402).json(metering.refusal);
  }

  try {
    // AssemblyAI Voice Agent Token Minting endpoint
    // Voice Agent API requires Bearer header!
    const response = await fetch(
      `https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=${metering.maxSessionSeconds}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Token Minting Error]', response.status, errorText);
      return res.status(response.status).json({
        error: 'Failed to mint AssemblyAI voice agent token',
        details: errorText
      });
    }

    const data = (await response.json()) as any;
    const company = (req.body && req.body.company) || 'Acme Coaching Co.';
    const bv = brandVoiceService.getProfileByCompany(company);

    if (req.body && Array.isArray(req.body.history) && req.body.history.length > 0) {
      await crmStore.ready;
      const lead = crmStore.getLeads().find(
        (l) => l.companyName === company || l.fullName.includes(company)
      );
      if (lead) {
        lead.notes.push(
          `[Voice Stream Handoff ${new Date().toLocaleTimeString()}]: Transitioned from text chat to live voice stream with ${req.body.history.length} turns in context.`
        );
        crmStore.commitLead(lead);
      }
    }

    // The disclosure policy ships with the token so the client cannot open a
    // session without it. Deciding this server-side keeps it authoritative:
    // a client that forgets to prepend the disclosure is a statutory violation,
    // not a cosmetic bug.
    const policy = complianceService.getPolicy((req.body && req.body.state) || null);

    await crmStore.flush();
    return res.json({
      token: data.token,
      isDemo: false,
      brandVoice: bv,
      compliance: policy,
      // The client must send callToken back with its telemetry so the server can
      // attribute the call to a tenant it chose, not one the client named.
      // Absent when metering is not configured; the client then reports nothing
      // billable, which is the safe direction.
      ...(metering.callId ? { callId: metering.callId } : {}),
      ...(metering.callToken ? { callToken: metering.callToken } : {}),
      ...(metering.warning ? { warning: metering.warning, minutesRemaining: metering.minutesRemaining } : {})
    });
  } catch (err: any) {
    console.error('[Token Route Exception]', err);
    return res.status(500).json({ error: 'Internal server error during token generation', message: err.message });
  }
});

// Interactive Text & Keyboard Conversation Route
tokenRouter.post('/chat', optionalUser, async (req: Request, res: Response) => {
  const { text, persona, prospect, history } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text input is required' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'Text input exceeds 4000 character limit' });
  }
  if (history !== undefined && (!Array.isArray(history) || history.length > 50)) {
    return res.status(400).json({ error: 'history must be an array of at most 50 turns' });
  }

  // 1. Detect Email and Phone
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const phoneRegex = /((?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);

  const fallbackEmail = prospect?.company 
    ? `${prospect.company.toLowerCase().replace(/[^a-z0-9]/g, '')}@inbound.lead`
    : `inbound_${Date.now().toString(36)}@growth.ai`;
  const prospectEmail = emailMatch ? emailMatch[0] : (prospect?.email || fallbackEmail);
  const prospectPhone = phoneMatch ? phoneMatch[0] : prospect?.phone;

  // Dedup by email needs stored leads loaded, or a cold instance creates a duplicate.
  await crmStore.ready;
  const updatedLead = crmStore.createOrUpdateLead({
    fullName: prospect?.name || (prospect?.company ? `${prospect.company} Founder` : 'Prospective Founder'),
    email: prospectEmail,
    phone: prospectPhone,
    website: prospect?.website,
    linkedIn: prospect?.linkedIn,
    companyName: prospect?.company || 'Founder Studio',
    businessSummary: prospect?.bio || text,
    source: 'after_hours_inbound'
  });

  updatedLead.notes.push(`[Typed Interaction ${new Date().toLocaleTimeString()}]: "${text}"`);
  crmStore.commitLead(updatedLead);

  // 2. Generate Anna's contextual spoken reply using Live LLM (DeepSeek) & Brand Voice DNA
  const safeName = (updatedLead?.companyName || updatedLead?.fullName || prospect?.company || 'Founder')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const companyName = updatedLead?.companyName || prospect?.company || 'your brand';
  const bv = updatedLead?.brandVoice || brandVoiceService.getProfileByCompany(companyName);
  const toneLabel = bv?.toneLabel || 'Tactical Operator';
  const vaultPath = updatedLead ? `vault/Clients/${safeName}/Dossier.md` : null;
  const brandVoiceVaultPath = updatedLead ? `vault/Clients/${safeName}/BrandVoice.md` : null;

  // Same builder the eval harness grades against.
  const systemPrompt = buildChatSystemPrompt({
    companyName,
    activeAccount: updatedLead?.fullName || prospect?.name || companyName,
    coreOffering:
      bv?.coreValueProposition || prospect?.bio || 'Autonomous operating layer with automated agent loops and persistent Obsidian memory',
    toneLabel,
    toneDescription: bv?.toneDescription,
    signatureLexicon: bv?.signatureLexicon,
    bannedTerms: bv?.bannedTerms
  });

  // Build multi-turn context from client history or lead interaction history
  const recentTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (Array.isArray(history) && history.length > 0) {
    for (const turn of history.slice(-8)) {
      if (turn.role && turn.content) {
        recentTurns.push({
          role: turn.role === 'assistant' ? 'assistant' : 'user',
          content: turn.content
        });
      }
    }
  } else {
    const interactionNotes = (updatedLead.notes || []).filter(
      (n) => n.startsWith('[Typed Interaction') || n.startsWith('[Agent Reply')
    );
    const recentHistory = interactionNotes.slice(-6);
    for (const n of recentHistory) {
      const match = n.match(/\]: "(.*)"$/);
      if (match && match[1]) {
        const role = n.startsWith('[Agent Reply') ? 'assistant' : 'user';
        recentTurns.push({ role, content: match[1] });
      }
    }
  }

  // Ensure current user message is at the end of the history
  if (recentTurns.length === 0 || recentTurns[recentTurns.length - 1].content !== text) {
    recentTurns.push({ role: 'user', content: text });
  }

  let reply = '';

  const authed = req as OptionalAuthedRequest;
  let deepseekApiKey: string | undefined;
  if (authed.workspace) {
    try {
      const secrets = await workspaceKeysService.getSecrets(authed.workspace.tenantId, 'deepseek');
      if (secrets?.apiKey) deepseekApiKey = secrets.apiKey;
    } catch (err: any) {
      console.warn('[Chat Route] Could not read the caller BYOK key, using the server key:', err?.name, err?.cause?.code ?? '');
    }
  }

  try {
    // Real tool-calling turn: the model may call CRM/knowledge tools (dispatched
    // against the live CRM) before it answers. BYOK key override is unchanged.
    const turn = await runAgentTurn({
      systemPrompt,
      history: recentTurns,
      tools: VOICE_AGENT_TOOLS,
      dispatch: (name, args) => toolDispatcher.dispatch(name, args),
      temperature: 0.4,
      llm: async (r) => {
        const c = await deepseekService.createCompletion({
          temperature: r.temperature,
          max_tokens: 300,
          apiKey: deepseekApiKey,
          messages: r.messages,
          tools: r.tools
        });
        return { content: c?.content ?? '', tool_calls: c?.tool_calls, isFallback: !!c?.isFallback, model: c?.model };
      }
    });

    // Only accept genuine model output. The fallback also returns truthy content,
    // so without this check Anna would speak the service's placeholder string to
    // prospects and the contextual fallback below could never run.
    if (turn.reply && !turn.isFallback) {
      reply = turn.reply
        .replace(/^["']|["']$/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    }
  } catch (llmErr) {
    console.warn('[DeepSeek Chat Completion Error, using fallback]', llmErr);
  }

  // Contextual fallback when no live model reply is available.
  if (!reply) {
    if (emailMatch || phoneMatch) {
      reply = `I have logged your contact details (${prospectEmail || ''}) and synchronized your GrowthOS dossier into your vault. What is your target deployment timeline and capital allocation for this phase?`;
    } else {
      reply = `Understood. For ${companyName}, GrowthOS installs autonomous inbound qualification and retention infrastructure so you scale unit economics hands-off. What is the primary operational friction point you want to solve first?`;
    }
  }

  updatedLead.notes.push(`[Agent Reply ${new Date().toLocaleTimeString()}]: "${reply}"`);
  crmStore.commitLead(updatedLead);

  // The lead and both conversation notes must be stored before this returns.
  await crmStore.flush();
  res.json({
    reply,
    lead: updatedLead,
    brandVoice: bv,
    vaultPath,
    brandVoiceVaultPath
  });
});

