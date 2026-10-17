import { DeepSeekService } from '../services/deepseekService';

describe('DeepSeekService fallback behavior', () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it('isConfigured() is false when no key is set', () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(new DeepSeekService().isConfigured()).toBe(false);
  });

  it('isConfigured() is false for the placeholder key', () => {
    process.env.DEEPSEEK_API_KEY = 'your_deepseek_api_key_here';
    expect(new DeepSeekService().isConfigured()).toBe(false);
  });

  it('never calls fetch when unconfigured, and returns the fallback shape', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const service = new DeepSeekService();
    const result = await service.createCompletion({
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('uses the server key when no apiKey override is given', async () => {
    process.env.DEEPSEEK_API_KEY = 'server-key';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'deepseek-flash', usage: {} })
    });
    global.fetch = fetchSpy as any;

    await new DeepSeekService().createCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer server-key');
  });

  it('uses the override apiKey when one is given, even if the server key is unset', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'deepseek-flash', usage: {} })
    });
    global.fetch = fetchSpy as any;

    const result = await new DeepSeekService().createCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'user-own-key'
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer user-own-key');
    expect(result.isFallback).toBe(false);
  });

  it('never mutates the instance server key when an override is used', async () => {
    process.env.DEEPSEEK_API_KEY = 'server-key';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'deepseek-flash', usage: {} })
    });
    global.fetch = fetchSpy as any;

    const service = new DeepSeekService();
    await service.createCompletion({ messages: [{ role: 'user', content: 'hi' }], apiKey: 'user-own-key' });
    await service.createCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer user-own-key');
    expect(fetchSpy.mock.calls[1][1].headers.Authorization).toBe('Bearer server-key');
  });

  it('defaults to the deepseek-flash model', async () => {
    process.env.DEEPSEEK_API_KEY = 'server-key';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'deepseek-flash', usage: {} })
    });
    global.fetch = fetchSpy as any;

    await new DeepSeekService().createCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).model).toBe('deepseek-flash');
  });

  // deepseek-flash reasons by default and hidden reasoning tokens count against
  // max_tokens: at max_tokens 300 a measured call returned zero characters of content.
  describe('thinking mode', () => {
    const okResponse = () =>
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'deepseek-flash', usage: {} })
      });
    const bodyOf = (spy: jest.Mock) => JSON.parse(spy.mock.calls[0][1].body);

    beforeEach(() => {
      process.env.DEEPSEEK_API_KEY = 'server-key';
    });

    it('disables thinking by default so max_tokens is spent on the reply', async () => {
      const fetchSpy = okResponse();
      global.fetch = fetchSpy as any;
      await new DeepSeekService().createCompletion({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 300 });
      expect(bodyOf(fetchSpy).thinking).toEqual({ type: 'disabled' });
      expect(bodyOf(fetchSpy).max_tokens).toBe(300);
    });

    it('lets a caller opt in to thinking', async () => {
      const fetchSpy = okResponse();
      global.fetch = fetchSpy as any;
      await new DeepSeekService().createCompletion({ messages: [{ role: 'user', content: 'hi' }], thinking: 'enabled' });
      expect(bodyOf(fetchSpy).thinking).toEqual({ type: 'enabled' });
    });

    it.each(['deepseek-reasoner', 'deepseek-chat'])('does not send thinking to the legacy %s model', async (model) => {
      const fetchSpy = okResponse();
      global.fetch = fetchSpy as any;
      await new DeepSeekService().createCompletion({ model, messages: [{ role: 'user', content: 'hi' }] });
      expect(bodyOf(fetchSpy)).not.toHaveProperty('thinking');
    });

    it('warns when a reply came back empty because it hit the token limit', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' }, finish_reason: 'length' }],
          model: 'deepseek-flash',
          usage: { completion_tokens: 300 }
        })
      }) as any;
      const result = await new DeepSeekService().createCompletion({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 300 });
      expect(result.content).toBe('');
      expect(result.isFallback).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('empty'));
      warn.mockRestore();
    });
  });
});
