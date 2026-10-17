interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class CacheEngine {
  private exactCache: Map<string, CacheEntry<any>> = new Map();
  private semanticCache: Array<{ pattern: RegExp; response: any; expiresAt: number }> = [];

  constructor() {
    this.seedSemanticCache();
  }

  private seedSemanticCache() {
    // Semantic rules for frequent intent patterns
    this.semanticCache.push(
      {
        pattern: /(what('?s| is) (the )?price|how much does (it|the program) cost)/i,
        response: {
          pricingSummary:
            'Programs range from the Self-Paced Sprint at $997 to Pro Mentorship at $2,997 ($497/mo) and Elite Mastermind at $7,500.'
        },
        expiresAt: Date.now() + 3600 * 1000
      },
      {
        pattern: /(can i get a refund|what is your refund policy|is there a money back guarantee)/i,
        response: {
          guaranteeSummary:
            'Yes, we offer an unconditional 14-day action-based refund guarantee. Complete Module 1 worksheets and the onboarding call, and if you are not satisfied, receive 100% of your money back.'
        },
        expiresAt: Date.now() + 3600 * 1000
      }
    );
  }

  public getExact<T>(key: string): T | null {
    const entry = this.exactCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.exactCache.delete(key);
      return null;
    }
    return entry.data;
  }

  public setExact<T>(key: string, data: T, ttlSeconds: number = 300) {
    this.exactCache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  public getSemantic(query: string): any | null {
    const match = this.semanticCache.find((entry) => entry.pattern.test(query));
    if (!match) return null;
    if (Date.now() > match.expiresAt) return null;
    return match.response;
  }

  public invalidate(key: string) {
    this.exactCache.delete(key);
  }
}

export const cacheEngine = new CacheEngine();
