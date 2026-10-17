import * as mod from '../../buyerlab/defaultRouter';

describe('defaultRouter', () => {
  it('exports a lazy factory and no eagerly built router', () => {
    expect(typeof mod.createDefaultBuyerLabRouter).toBe('function');
    expect(mod.createDefaultBuyerLabRouter.name).toBe('createDefaultBuyerLabRouter');
    expect(Object.keys(mod)).toEqual(['createDefaultBuyerLabRouter']);
  });

  it('builds a router when called, without needing a database', () => {
    const router = mod.createDefaultBuyerLabRouter();
    expect(typeof router).toBe('function');
    expect(Array.isArray((router as any).stack)).toBe(true);
  });
});
