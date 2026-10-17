import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

import { tokenRouter } from './routes/token';
import { crmRouter } from './routes/crm';
import { contentRouter } from './routes/content';
import { graphRouter } from './routes/graph';
import { billingRouter } from './routes/billing';
import { instaticRouter } from './routes/instatic';
import { complianceRouter } from './routes/compliance';
import { telemetryRouter } from './routes/telemetry';
import { evalsRouter } from './routes/evals';
import { createDefaultBuyerLabRouter } from './buyerlab/defaultRouter';
import { createMeRouter } from './routes/me';
import { createRequireUser } from './middleware/requireUser';
import { isDatabaseConfigured } from './db/client';
import { workspaceService } from './services/workspaceService';
import { workspaceKeysService } from './services/workspaceKeysService';
import { testKey, PerUserRateLimiter } from './services/keyTesters';
import { VOICE_AGENT_TOOLS } from './tools/registry';
import { toolDispatcher } from './tools/dispatcher';
import { crmStore } from './services/crmStore';
import { contentFactoryEngine } from './services/contentFactoryEngine';
import { graphDatabaseService } from './services/graphDatabaseService';
import { stripeService } from './services/stripeService';
import { billingService } from './services/billingService';

/**
 * Load .env from the app directory first, then walk up to the monorepo root.
 *
 * `npm run dev` leaves cwd at apps/orchestrator, so a repo-root .env was
 * invisible and the server booted with no ASSEMBLYAI_API_KEY — every voice call
 * returned 503 while the file sat two directories up. dotenv does not overwrite
 * values already in process.env, so the nearest file wins and real environment
 * variables (Docker, Railway) always beat any file.
 */
const ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

const loadedEnvFiles: string[] = [];
for (const candidate of ENV_CANDIDATES) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    loadedEnvFiles.push(candidate);
  }
}

const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// The embeddable widget runs on customer sites, so it cannot share the dashboard's
// origin allowlist. Only the widget's own endpoint gets the wider policy; every
// other route stays locked to CORS_ALLOWED_ORIGINS.
// /api/voice/config and /api/crm/tools/execute are here because the widget registers
// the same tool set as the console and executes tool.call over HTTP. Without them the
// embedded agent can hold a conversation but cannot capture a lead.
const WIDGET_ROUTES = [
  '/api/voice/token',
  '/api/voice/config',
  '/api/crm/tools/execute',
  '/api/compliance/policy',
  '/api/compliance/consent',
  // The widget measures its own call latency and flushes it here, including a
  // pagehide beacon. Without the wider policy the preflight fails on customer
  // origins and every embedded call is silently unmeasured.
  '/api/telemetry/calls'
];
const widgetOrigins = (process.env.WIDGET_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors((req, callback) => {
    const isWidgetRoute = WIDGET_ROUTES.some((route) => req.path.startsWith(route));
    if (!isWidgetRoute) {
      return callback(null, { origin: allowedOrigins });
    }
    // Unset means "any site may embed", which is the demo posture and is warned
    // about at boot. Set WIDGET_ALLOWED_ORIGINS in production to pin customers.
    if (widgetOrigins.length === 0) {
      return callback(null, { origin: true });
    }
    return callback(null, { origin: widgetOrigins });
  })
);
/**
 * Stripe webhook. Mounted BEFORE express.json() because signature verification
 * needs the exact bytes Stripe signed — the JSON parser re-serialises the body
 * and the signature then never matches.
 *
 * This endpoint is the only authority on whether a payment happened. It is
 * unauthenticated by design (Stripe cannot send our bearer key) and is instead
 * authenticated by the signature, so an unverified request must be rejected.
 */
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('stripe-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = stripeService.constructEvent(req.body as Buffer, signature);
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    const state = stripeService.extractSubscriptionState(event);
    const tenantId = state?.tenantId;
    if (state && tenantId) {
      await billingService.applySubscriptionState({ ...state, tenantId });
      console.log(`[Stripe Webhook] ${event.type} applied for tenant ${tenantId}`);
    } else if (state) {
      // Metadata is set when the session is created, so a missing tenantId means
      // the subscription was made outside this app. Log it rather than guessing.
      console.warn(`[Stripe Webhook] ${event.type} had no tenantId in metadata; skipped.`);
    }
    // Always acknowledge a verified event, even one we do not act on. Returning
    // an error makes Stripe retry an event we are simply not interested in.
    res.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook] Handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

app.use(express.json({ limit: '1mb' }));

// Minting a token costs real AssemblyAI minutes, and the widget endpoint is
// reachable by anyone who embeds the script. Cap it per client so a hostile or
// looping page cannot drain the account. In-memory is enough for a single
// instance; this moves to the datastore when the app scales horizontally.
//
// Extracted into a factory because telemetry ingest needs exactly the same
// treatment — it is public for the same reason and writes to the datastore —
// and two copies of this logic would drift.
function perIpRateLimit(limit: number, windowMs: number, message: string) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    entry.count += 1;
    next();
  };
}

const TOKEN_RATE_LIMIT = Number(process.env.VOICE_TOKEN_RATE_LIMIT || 20);
const TOKEN_RATE_WINDOW_MS = 60_000;

app.use(
  '/api/voice/token',
  perIpRateLimit(
    TOKEN_RATE_LIMIT,
    TOKEN_RATE_WINDOW_MS,
    'Too many voice sessions from this address. Try again shortly.'
  )
);

// Telemetry flushes several times per call (periodic, end-of-call, pagehide),
// so the ceiling is higher than for token minting, but it still has one.
const TELEMETRY_RATE_LIMIT = Number(process.env.TELEMETRY_RATE_LIMIT || 120);

app.use(
  '/api/telemetry',
  perIpRateLimit(
    TELEMETRY_RATE_LIMIT,
    TOKEN_RATE_WINDOW_MS,
    'Too many telemetry submissions from this address.'
  )
);

// Static assets & embeddable widget
// __dirname differs between ts-node (src/), the Docker build (dist/), and a
// serverless bundle, so try each layout and fall back to cwd rather than
// silently serving a directory that does not exist.
const PUBLIC_DIR_CANDIDATES = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '../src/public'),
  path.join(__dirname, '../public'),
  path.resolve(process.cwd(), 'src/public'),
  path.resolve(process.cwd(), 'dist/public')
];
const publicDir = PUBLIC_DIR_CANDIDATES.find((dir) => fs.existsSync(dir)) || PUBLIC_DIR_CANDIDATES[0];

app.use(express.static(publicDir));
app.get('/embed.js', (_req, res) => {
  res.sendFile(path.join(publicDir, 'embed.js'));
});
app.get('/widget-preview', (_req, res) => {
  res.sendFile(path.join(publicDir, 'widget-preview.html'));
});

// Mount HTTP routes
app.use('/api/voice', tokenRouter);
app.use('/api/crm', crmRouter);
app.use('/api/content', contentRouter);
app.use('/api/graph', graphRouter);
app.use(
  '/api/me',
  createMeRouter({
    requireUser: createRequireUser({
      authBaseUrl: process.env.NEON_AUTH_BASE_URL,
      workspaces: workspaceService,
      storageReady: isDatabaseConfigured
    }),
    keys: workspaceKeysService,
    testKey,
    limiter: new PerUserRateLimiter()
  })
);
app.use('/api/billing', billingRouter);
app.use('/api/instatic', instaticRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/buyerlab', createDefaultBuyerLabRouter());

// Root landing info
app.get('/', (_req, res) => {
  res.json({
    service: 'StratosGTM — Voice Orchestrator API',
    status: 'operational',
    backendPort: 4000,
    webConsoleUrl: 'http://localhost:3000',
    endpoints: {
      health: '/api/health',
      voiceConfig: '/api/voice/config',
      crmLeads: '/api/crm/leads',
      crmMembers: '/api/crm/members',
      contentJobs: '/api/content/jobs',
      graphStats: '/api/graph/stats',
      graphNodes: '/api/graph/nodes',
      graphEdges: '/api/graph/edges',
      me: '/api/me',
      meCredentials: '/api/me/credentials/:platform',
      billingPlans: '/api/billing/plans',
      billingUsage: '/api/billing/usage/:clientId',
      telemetryIngest: 'POST /api/telemetry/calls',
      telemetrySummary: '/api/telemetry/summary',
      instaticPages: '/api/instatic/pages',
      instaticPreview: '/api/instatic/preview/:pageId',
      embedWidget: '/embed.js',
      widgetPreview: '/widget-preview',
      telemetryWs: 'ws://localhost:4000/ws/telemetry'
    }
  });
});

// Health check and session info
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'voice-orchestrator',
    voiceProvider: 'assemblyai-voice-agent',
    registeredTools: VOICE_AGENT_TOOLS.map((t) => t.name)
  });
});

app.get('/api/voice/config', (_req, res) => {
  res.json({
    // The Voice Agent API exposes no model-selection field, so we do not claim
    // one. Naming a specific model here was cosmetic: it was never sent.
    voice: 'anna',
    tools: VOICE_AGENT_TOOLS,
    system_prompt:
      'You are the AI Growth Operator for an elite online creator. Your job is to warmly qualify inbound prospective students using BANT criteria, answer curriculum and pricing questions accurately, handle objections, and record consultation requests for the team to confirm. For cancellation requests, understand their core frustration and offer policy-compliant retention packages. You can also trigger the autonomous Hermes Content Factory using run_content_factory. ' +
      'Call the matching tool as soon as you have the information it needs — do not wait until the end of the call, and do not just talk about the information without saving it: call create_or_update_lead once you know their name and email; call qualify_lead once you know their budget, core need and authority, mapping what they say to the closest budgetRange bucket rather than skipping the call for being approximate; call schedule_growth_consultation as soon as they ask to talk to someone, even with only a rough date or time. ' +
      'Never tell the prospect that something is logged, recorded, saved, scheduled or confirmed unless you have actually called the matching tool and it returned success — if a tool call fails, say so plainly instead of claiming it worked.'
  });
});

// Eval harness: GET /report, POST /run, POST /runs. See routes/evals.ts.
app.use('/api/evals', evalsRouter);

const server = http.createServer(app);

// WebSocket Server for live frontend telemetry and tool execution bridge
const wss = new WebSocketServer({ server, path: '/ws/telemetry' });

// Broadcast Hermes Content Factory updates to all connected UI clients
contentFactoryEngine.setUpdateListener((job) => {
  const payload = JSON.stringify({
    type: 'content_factory_job_updated',
    job,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

// Broadcast CRM lead updates (e.g. Kanban drag-and-drop status changes) to all connected UI clients
crmStore.setUpdateListener((lead) => {
  const payload = JSON.stringify({
    type: 'lead_updated',
    lead,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

wss.on('connection', (ws: WebSocket) => {
  console.log('[Telemetry WS] Client connected to live telemetry stream');

  // Send initial state
  ws.send(
    JSON.stringify({
      type: 'initial_state',
      leads: crmStore.getLeads(),
      members: crmStore.getMembers(),
      jobs: contentFactoryEngine.getJobs(),
      tools: VOICE_AGENT_TOOLS
    })
  );

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'ping') {
        ws.send(
          JSON.stringify({
            type: 'pong',
            clientTimestamp: data.clientTimestamp || data.timestamp,
            serverTimestamp: Date.now()
          })
        );
        return;
      }

      if (data.type === 'tool_execution_request') {
        const { call_id, name, arguments: args } = data;
        let result: unknown;
        let failed = false;

        try {
          result = await toolDispatcher.dispatch(name, args);
        } catch (toolErr: any) {
          failed = true;
          result = { error: toolErr?.message || 'Tool execution failed' };
          console.error('[Tool Dispatch Error]', name, toolErr?.message);
        }

        // Return the result to the REQUESTING client only, so it can complete the
        // AssemblyAI tool call. This must not be broadcast: with two tabs open,
        // every tab would answer the same call_id. Without this the agent waits
        // out its timeout_seconds and the conversation stalls mid-sentence.
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'tool_result', call_id, name, result, failed }));
        }

        // Broadcast tool event to all connected UI clients
        const eventPayload = JSON.stringify({
          type: 'tool_executed',
          call_id,
          name,
          arguments: args,
          result,
          leads: crmStore.getLeads(),
          members: crmStore.getMembers(),
          timestamp: new Date().toISOString()
        });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(eventPayload);
          }
        });
      }
    } catch (e: any) {
      console.error('[Telemetry WS Message Error]', e.message);
    }
  });
});

/**
 * Serverless hosts import this module and drive the Express app themselves, so
 * binding a port there would be wrong (and on some platforms fatal). Listen only
 * when this file is the entry point — i.e. local dev, Docker, or a container host.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isServerless) {
  startServer();
}

export default app;
export { app, server };

function startServer() {
server.listen(port, () => {
  console.log(`=======================================================`);
  console.log(`🎙️  AI Growth Operator Voice OS — Orchestrator Running`);
  console.log(`🚀 Port: http://localhost:${port}`);
  console.log(`⚡ Voice: AssemblyAI Voice Agent API`);
  console.log(
    loadedEnvFiles.length
      ? `📄 Env loaded from: ${loadedEnvFiles.join(', ')}`
      : '📄 No .env file found; using process environment only.'
  );
  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.warn('⚠️  ASSEMBLYAI_API_KEY is unset — /api/voice/token will return 503 and voice calls are disabled.');
  }
  if (widgetOrigins.length === 0) {
    console.warn('⚠️  WIDGET_ALLOWED_ORIGINS is unset — any site may embed the widget and mint voice tokens.');
  }
  console.log(`🛠️  Tools Registered: ${VOICE_AGENT_TOOLS.length}`);
  console.log(`=======================================================`);
});
}
