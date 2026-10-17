import { runAgentTurn, MAX_AGENT_ITERATIONS, AgentLLM } from '../services/agentLoop';
import { VOICE_AGENT_TOOLS } from '../tools/registry';

const call = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }
});
const base = (llm: AgentLLM, dispatch = jest.fn().mockResolvedValue({ status: 'success' })) => ({
  systemPrompt: 'sys',
  history: [{ role: 'user' as const, content: 'hi' }],
  tools: VOICE_AGENT_TOOLS,
  dispatch,
  llm
});

describe('runAgentTurn', () => {
  it('returns the reply directly when the model calls no tools', async () => {
    const llm: AgentLLM = jest.fn().mockResolvedValue({ content: ' Hello. ', isFallback: false, model: 'm' });
    const out = await runAgentTurn(base(llm));
    expect(out).toMatchObject({ reply: 'Hello.', toolCalls: [], isFallback: false, model: 'm', iterations: 1 });
  });

  it('passes tools in OpenAI function format', async () => {
    const llm = jest.fn().mockResolvedValue({ content: 'ok', isFallback: false });
    await runAgentTurn(base(llm));
    const req = llm.mock.calls[0][0];
    expect(req.tools).toHaveLength(VOICE_AGENT_TOOLS.length);
    expect(req.tools[0]).toMatchObject({ type: 'function', function: { name: 'create_or_update_lead' } });
  });

  it('dispatches tool calls, feeds role:tool results back, then returns the final text', async () => {
    const dispatch = jest.fn().mockResolvedValue({ status: 'success', leadId: 'l1' });
    const llm = jest
      .fn()
      .mockResolvedValueOnce({ content: '', tool_calls: [call('c1', 'create_or_update_lead', { fullName: 'A', email: 'a@b.co' })], isFallback: false })
      .mockResolvedValueOnce({ content: 'Logged.', isFallback: false });
    const out = await runAgentTurn(base(llm, dispatch));
    expect(dispatch).toHaveBeenCalledWith('create_or_update_lead', { fullName: 'A', email: 'a@b.co' });
    expect(out.reply).toBe('Logged.');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({ name: 'create_or_update_lead', failed: false, result: { leadId: 'l1' } });
    const second = llm.mock.calls[1][0].messages;
    expect(second[second.length - 1]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(second[second.length - 2]).toMatchObject({ role: 'assistant' });
  });

  it('marks a thrown tool, an error result and unparsable arguments as failed and keeps going', async () => {
    const dispatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ status: 'error', message: 'nope' });
    const llm = jest
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [call('1', 'qualify_lead', {}), call('2', 'qualify_lead', {}), call('3', 'qualify_lead', '{not json')],
        isFallback: false
      })
      .mockResolvedValueOnce({ content: 'Sorry.', isFallback: false });
    const out = await runAgentTurn(base(llm, dispatch));
    expect(out.toolCalls.map((t) => t.failed)).toEqual([true, true, true]);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(out.reply).toBe('Sorry.');
  });

  it('caps iterations and forces a text answer by withholding tools on the last call', async () => {
    const llm = jest.fn().mockImplementation(async (req) =>
      req.tools
        ? { content: '', tool_calls: [call('x', 'get_product_knowledge', { query: 'q' })], isFallback: false }
        : { content: 'Final.', isFallback: false }
    );
    const out = await runAgentTurn(base(llm));
    expect(llm).toHaveBeenCalledTimes(MAX_AGENT_ITERATIONS);
    expect(llm.mock.calls[MAX_AGENT_ITERATIONS - 1][0].tools).toBeUndefined();
    expect(out.reply).toBe('Final.');
    expect(out.toolCalls).toHaveLength(MAX_AGENT_ITERATIONS - 1);
  });

  it('reports isFallback with an empty reply when the provider fell back', async () => {
    const llm = jest.fn().mockResolvedValue({ content: 'placeholder text', isFallback: true });
    const out = await runAgentTurn(base(llm));
    expect(out).toMatchObject({ reply: '', isFallback: true });
  });
});
