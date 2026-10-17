import { createBuyerLlm, parseJsonObject, LlmUnavailableError, LlmOutputError } from '../../buyerlab/llm';

describe('createBuyerLlm', () => {
  const service = { createCompletion: jest.fn() };
  beforeEach(() => service.createCompletion.mockReset());

  it('asks for JSON with thinking disabled and uses the caller key', async () => {
    service.createCompletion.mockResolvedValue({ content: '{"a":1}', tokens: { prompt: 10, completion: 5, total: 15 }, model: 'deepseek-flash', isFallback: false });
    const r = await createBuyerLlm('user-key', service as any)({ system: 'S', user: 'U', maxTokens: 900 });
    const arg = service.createCompletion.mock.calls[0][0];
    expect(arg).toMatchObject({ apiKey: 'user-key', thinking: 'disabled', response_format: { type: 'json_object' }, max_tokens: 900 });
    expect(arg.messages).toEqual([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
    expect(r).toEqual({ content: '{"a":1}', promptTokens: 10, completionTokens: 5, model: 'deepseek-flash' });
  });

  it('passes no key when none is given (the server key is used)', async () => {
    service.createCompletion.mockResolvedValue({ content: '{}', tokens: { prompt: 1, completion: 1, total: 2 }, model: 'm', isFallback: false });
    await createBuyerLlm(undefined, service as any)({ system: 'S', user: 'U' });
    expect(service.createCompletion.mock.calls[0][0].apiKey).toBeUndefined();
  });

  it('never returns fallback text as a model answer', async () => {
    service.createCompletion.mockResolvedValue({ content: 'placeholder', tokens: { prompt: 0, completion: 0, total: 0 }, model: 'fallback:none', isFallback: true });
    await expect(createBuyerLlm('k', service as any)({ system: 'S', user: 'U' })).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('treats an empty reply as an output error, not a result', async () => {
    service.createCompletion.mockResolvedValue({ content: '', tokens: { prompt: 5, completion: 300, total: 305 }, model: 'm', isFallback: false });
    await expect(createBuyerLlm('k', service as any)({ system: 'S', user: 'U' })).rejects.toBeInstanceOf(LlmOutputError);
  });
});

describe('parseJsonObject', () => {
  it('parses plain JSON', () => expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 }));
  it('strips a markdown fence', () => expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('finds the object inside surrounding prose', () => expect(parseJsonObject('Here you go: {"a":{"b":2}} thanks')).toEqual({ a: { b: 2 } }));
  it.each(['[1,2]', 'not json', '', '"string"', 'null'])('rejects %j', (t) => expect(() => parseJsonObject(t)).toThrow(LlmOutputError));
});
