import { runConversation, transcriptText, MAX_CONVERSE_TURNS, ConversationTurn } from '../../buyerlab/converse';
import { buildConversationClaimsPrompt } from '../../buyerlab/prompts';
import { normaliseConversation } from '../../buyerlab/normaliser';
import { mkPersona } from './helpers';
import type { AgentLLM } from '../../services/agentLoop';
import type { BuyerLlm } from '../../buyerlab/llm';

const persona = mkPersona();
const buyerReply = (message: string): BuyerLlm => async () => ({ content: JSON.stringify({ message }), promptTokens: 10, completionTokens: 5, model: 'stub' });
const agentReply = (reply: string): AgentLLM => async () => ({ content: reply, isFallback: false, model: 'stub-agent' });

describe('runConversation', () => {
  it('alternates buyer and agent turns up to MAX_CONVERSE_TURNS', async () => {
    const buyer = jest.fn(async () => ({ content: JSON.stringify({ message: 'What does this cost?' }), promptTokens: 1, completionTokens: 1, model: 'm' }));
    const agent = jest.fn(async () => ({ content: 'It depends on scope — what are you trying to solve?', isFallback: false, model: 'a' }));
    const turns = await runConversation(persona, buyer, agent);
    expect(turns).toHaveLength(MAX_CONVERSE_TURNS * 2);
    expect(turns.map((t) => t.role)).toEqual(Array(MAX_CONVERSE_TURNS).fill(['buyer', 'agent']).flat());
    expect(buyer).toHaveBeenCalledTimes(MAX_CONVERSE_TURNS);
    expect(agent).toHaveBeenCalledTimes(MAX_CONVERSE_TURNS);
  });

  it('passes the growing transcript to the buyer prompt each turn', async () => {
    const seen: string[] = [];
    const buyer: BuyerLlm = async (req) => {
      seen.push(req.user);
      return { content: JSON.stringify({ message: `turn ${seen.length}` }), promptTokens: 1, completionTokens: 1, model: 'm' };
    };
    await runConversation(persona, buyer, agentReply('ok'));
    expect(seen[0]).toMatch(/has not started yet/);
    expect(seen[1]).toContain('turn 1');
    expect(seen[1]).toContain('ok');
  });

  it('stops early, keeping what happened so far, when the buyer LLM fails', async () => {
    const buyer = jest.fn().mockResolvedValueOnce({ content: JSON.stringify({ message: 'hi' }), promptTokens: 1, completionTokens: 1, model: 'm' }).mockRejectedValueOnce(new Error('down'));
    const turns = await runConversation(persona, buyer, agentReply('hello'));
    expect(turns).toEqual([{ role: 'buyer', text: 'hi' }, { role: 'agent', text: 'hello' }]);
  });

  it('stops early on an empty buyer message', async () => {
    const buyer: BuyerLlm = async () => ({ content: JSON.stringify({ message: '' }), promptTokens: 1, completionTokens: 1, model: 'm' });
    expect(await runConversation(persona, buyer, agentReply('x'))).toEqual([]);
  });

  it('stops early, keeping the buyer turn, when the agent is a fallback', async () => {
    const agent: AgentLLM = async () => ({ content: '', isFallback: true, model: undefined });
    const turns = await runConversation(persona, buyerReply('Tell me about pricing.'), agent);
    expect(turns).toEqual([{ role: 'buyer', text: 'Tell me about pricing.' }]);
  });

  it('never uses the production CRM: creating a lead in one conversation is invisible to the next', async () => {
    let capturedArgs: any;
    const creatingAgent: AgentLLM = async (req) => {
      const last = req.messages[req.messages.length - 1];
      if (last.role === 'user' && !capturedArgs) {
        return { content: '', isFallback: false, model: 'a', tool_calls: [{ id: '1', type: 'function', function: { name: 'create_or_update_lead', arguments: JSON.stringify({ fullName: 'Sam Skeptic', email: 'sam@example.com', source: 'web_callback' }) } }] };
      }
      return { content: 'Got it, thanks.', isFallback: false, model: 'a' };
    };
    const first = await runConversation(persona, buyerReply('My email is sam@example.com'), creatingAgent);
    expect(first.some((t) => t.role === 'agent')).toBe(true);

    // A second, independent conversation must not see the first's lead: it asks a tool
    // (qualify_lead, which fails when the CRM has no matching lead) to look up the same
    // email the first conversation registered, then reports what the tool actually found.
    // If runConversation ever shared a MemoryCrm across calls (e.g. hoisted to module scope),
    // the lookup would succeed here and this assertion would catch it.
    const lookupAgent: AgentLLM = async (req) => {
      const last = req.messages[req.messages.length - 1];
      if (last.role === 'user') {
        return {
          content: '',
          isFallback: false,
          model: 'a',
          tool_calls: [{ id: '1', type: 'function', function: { name: 'qualify_lead', arguments: JSON.stringify({ email: 'sam@example.com', budgetRange: 'above_15k', coreNeed: 'cut tool sprawl' }) } }]
        };
      }
      const toolResult = req.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse((m as { content: string }).content));
      const found = toolResult.some((r) => r.status === 'success');
      return { content: found ? 'Found existing lead on file.' : 'No lead on file for that email.', isFallback: false, model: 'a' };
    };
    const second = await runConversation(persona, buyerReply('Different question entirely'), lookupAgent);
    expect(second[1].text).toBe('No lead on file for that email.');
  });
});

describe('transcriptText', () => {
  it('renders buyer/agent turns as a readable transcript', () => {
    const turns: ConversationTurn[] = [{ role: 'buyer', text: 'Hi' }, { role: 'agent', text: 'Hello' }];
    expect(transcriptText(turns)).toBe('Buyer: Hi\nAnna: Hello');
  });
});

describe('buildConversationClaimsPrompt', () => {
  it('wraps the transcript as untrusted evaluation data and demands verbatim quotes', () => {
    const p = buildConversationClaimsPrompt(persona, 'Buyer: hi\nAnna: hello');
    expect(p.user).toContain('Buyer: hi\nAnna: hello');
    expect(p.user).toMatch(/verbatim/i);
    expect(p.user).toMatch(/12 characters/);
    expect(p.user).toMatch(/not a fact/i);
    expect(p.user).toContain(persona.spec.name);
  });
});

describe('normaliseConversation', () => {
  const transcript = 'Buyer: What does this cost?\nAnna: It depends on scope, so I cannot quote a number yet.';
  const claim = (over: Record<string, unknown> = {}) => ({ kind: 'objection', text: 'Anna would not give a price', severity: 'medium', quote: 'It depends on scope, so I cannot quote a number yet.', ...over });

  it('keeps a claim whose quote is verbatim in the transcript', () => {
    const r = normaliseConversation({ personaId: 'u1', sourceId: 'src-1', transcript, raw: { claims: [claim()] } });
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]).toMatchObject({ id: 'u1:c:1', kind: 'objection', sourceId: 'src-1', surface: 'public', quote: 'It depends on scope, so I cannot quote a number yet.' });
    expect(r.dropped).toEqual([]);
  });

  it('drops a quote that is not verbatim in the transcript', () => {
    const r = normaliseConversation({ personaId: 'u1', sourceId: 'src-1', transcript, raw: { claims: [claim({ quote: 'Anna refused to discuss price at all' })] } });
    expect(r.claims).toEqual([]);
    expect(r.dropped[0].reason).toBe('quote_not_found');
  });

  it('produces conversation-namespaced ids distinct from react-stage claim ids', () => {
    const r = normaliseConversation({ personaId: 'u1', sourceId: 'src-1', transcript, raw: { claims: [claim(), claim({ text: 'second' })] } });
    expect(r.claims.map((c) => c.id)).toEqual(['u1:c:1', 'u1:c:2']);
  });

  it('never throws on malformed model output; returns an empty result instead', () => {
    expect(normaliseConversation({ personaId: 'u1', sourceId: 's', transcript, raw: 'not an object' })).toEqual({ claims: [], dropped: [] });
    expect(normaliseConversation({ personaId: 'u1', sourceId: 's', transcript, raw: { claims: 'nope' } })).toEqual({ claims: [], dropped: [] });
  });

  it('drops malformed claim items and caps the total considered', () => {
    const many = Array.from({ length: 20 }, () => claim());
    const r = normaliseConversation({ personaId: 'u1', sourceId: 's', transcript, raw: { claims: [{ kind: 'nope' }, ...many] } });
    expect(r.dropped[0].reason).toBe('malformed');
    expect(r.claims.length + r.dropped.length).toBeLessThanOrEqual(13);
  });
});
