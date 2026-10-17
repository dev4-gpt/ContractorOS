import { wilson, passPowerK } from '../evals/stats';

describe('wilson', () => {
  it('matches published Wilson 95% values', () => {
    const a = wilson(8, 10)!;
    expect(a.low).toBeCloseTo(0.4902, 3);
    expect(a.high).toBeCloseTo(0.9433, 3);
    const b = wilson(0, 10)!;
    expect(b.low).toBe(0);
    expect(b.high).toBeCloseTo(0.2775, 3);
    const c = wilson(5, 5)!;
    expect(c.low).toBeCloseTo(0.5655, 3);
    expect(c.high).toBe(1);
  });
  it('is wide for tiny samples (5/5 is not "certain")', () => {
    expect(wilson(5, 5)!.low).toBeLessThan(0.6);
  });
  it('returns null for n = 0 and rejects impossible counts', () => {
    expect(wilson(0, 0)).toBeNull();
    expect(() => wilson(6, 5)).toThrow(RangeError);
  });
});

describe('passPowerK', () => {
  it('is the product of per-task p^k', () => {
    expect(passPowerK([{ passes: 5, n: 5 }, { passes: 4, n: 5 }], 2)).toBeCloseTo(0.64, 10);
    expect(passPowerK([{ passes: 3, n: 4 }], 3)).toBeCloseTo(0.421875, 10);
  });
  it('is 1 when everything always passes and 0 when any task never does', () => {
    expect(passPowerK([{ passes: 3, n: 3 }, { passes: 2, n: 2 }], 5)).toBe(1);
    expect(passPowerK([{ passes: 3, n: 3 }, { passes: 0, n: 3 }], 5)).toBe(0);
  });
  it('is not 1-(1-p)^k style circular inflation: 1/2 stays low', () => {
    expect(passPowerK([{ passes: 1, n: 2 }], 5)).toBeCloseTo(0.03125, 10);
  });
  it('returns null (not a number) when unmeasured', () => {
    expect(passPowerK([], 3)).toBeNull();
    expect(passPowerK([{ passes: 0, n: 0 }], 3)).toBeNull();
    expect(passPowerK([{ passes: 1, n: 1 }], 0)).toBeNull();
  });
});
