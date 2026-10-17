import { ToolDispatcher, decideDiscount, CrmPort } from '../tools/dispatcher';

/** Minimal member-only CRM: the retention path is what this file pins down. */
function makeStore() {
  const applied: any[] = [];
  const members = new Map<string, any>([
    ['mem_101', { memberId: 'mem_101', fullName: 'Sarah Jenkins', status: 'active' }]
  ]);
  const store = {
    ready: Promise.resolve(),
    flush: jest.fn().mockResolvedValue(undefined),
    createOrUpdateLead: jest.fn(),
    qualifyLead: jest.fn(),
    scheduleMeeting: jest.fn(),
    processRetention: jest.fn((d: any) => {
      const m = members.get(d.memberId);
      if (!m) return null;
      applied.push(d);
      m.status = d.requestedAction === 'confirm_cancellation' ? 'cancelled' : d.approvedDiscountPct > 0 ? 'saved' : 'retention_offered';
      return m;
    })
  };
  return { store: store as unknown as CrmPort & typeof store, applied };
}

// What the code in dispatcher.ts actually does (read from the source, not assumed):
//   proposed > 20        -> approved 15, manager review required, $500 audit-call bonus
//   15 < proposed <= 20  -> approved 15, NO manager review, vault-recordings bonus
//   0 <= proposed <= 15  -> approved as proposed, no review, no bonus
// Note 20 is NOT "allowed": the source comment says "up to 20% requires VIP" but no
// VIP check exists; 16-20 is simply clamped to 15.
const CLAMP_TABLE: Array<[number, number, boolean, boolean]> = [
  // proposed, approved, requiresReview, hasBonus
  [0, 0, false, false],
  [10, 10, false, false],
  [15, 15, false, false],
  [16, 15, false, true],
  [20, 15, false, true],
  [21, 15, true, true],
  [40, 15, true, true],
  [100, 15, true, true]
];

describe('retention discount clamp (decideDiscount)', () => {
  it.each(CLAMP_TABLE)('proposed %p -> approved %p, review %p, bonus %p', (proposed, approved, review, bonus) => {
    const d = decideDiscount(proposed);
    expect(d.approvedDiscount).toBe(approved);
    expect(d.requiresReview).toBe(review);
    expect(Boolean(d.bonusOffer)).toBe(bonus);
  });

  it.each([[-5], [NaN], ['abc'], [undefined], [null], [Infinity]])(
    'never lets a hostile or malformed proposal (%p) exceed 15 or go negative',
    (proposed) => {
      const d = decideDiscount(proposed as any);
      expect(d.approvedDiscount).toBeGreaterThanOrEqual(0);
      expect(d.approvedDiscount).toBeLessThanOrEqual(15);
      expect(Number.isNaN(d.approvedDiscount)).toBe(false);
    }
  );

  it('accepts numeric strings the way the model may emit them', () => {
    expect(decideDiscount('40').approvedDiscount).toBe(15);
    expect(decideDiscount('12').approvedDiscount).toBe(12);
  });
});

describe('ToolDispatcher process_retention_offer', () => {
  it.each(CLAMP_TABLE)('proposed %p reaches the CRM as %p', async (proposed, approved, review) => {
    const { store, applied } = makeStore();
    const out = await new ToolDispatcher(store).dispatch('process_retention_offer', {
      memberId: 'mem_101',
      churnReason: 'too_expensive',
      requestedAction: 'apply_discount',
      proposedDiscountPct: proposed
    });
    expect(out.status).toBe('retention_applied');
    expect(out.approvedDiscountPct).toBe(approved);
    expect(out.requiresManagerReview).toBe(review);
    expect(applied).toHaveLength(1);
    expect(applied[0].approvedDiscountPct).toBe(approved);
    expect(applied[0].requiresManagerReview).toBe(review);
  });

  it('errors for an unknown member without applying anything', async () => {
    const { store, applied } = makeStore();
    const out = await new ToolDispatcher(store).dispatch('process_retention_offer', {
      memberId: 'nope',
      churnReason: 'too_expensive',
      requestedAction: 'apply_discount',
      proposedDiscountPct: 10
    });
    expect(out.status).toBe('error');
    expect(applied).toHaveLength(0);
  });

  it('confirm_cancellation returns cancelled', async () => {
    const { store } = makeStore();
    const out = await new ToolDispatcher(store).dispatch('process_retention_offer', {
      memberId: 'mem_101',
      churnReason: 'no_time',
      requestedAction: 'confirm_cancellation'
    });
    expect(out.status).toBe('cancelled');
  });
});

describe('ToolDispatcher plumbing', () => {
  it('awaits ready before running and flushes after, even when the tool throws', async () => {
    const { store } = makeStore();
    store.processRetention.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      new ToolDispatcher(store).dispatch('process_retention_offer', {
        memberId: 'mem_101',
        churnReason: 'too_expensive',
        requestedAction: 'apply_discount'
      })
    ).rejects.toThrow('boom');
    expect(store.flush).toHaveBeenCalledTimes(1);
  });

  it('returns an error result for an unknown tool', async () => {
    const { store } = makeStore();
    const out = await new ToolDispatcher(store).dispatch('drop_tables', {});
    expect(out.status).toBe('error');
  });

  it('uses the injected content-job hook instead of the real engine', async () => {
    const { store } = makeStore();
    const startContentJob = jest.fn();
    const out = await new ToolDispatcher(store, { startContentJob }).dispatch('run_content_factory', { topic: 'churn' });
    expect(out.status).toBe('queued');
    expect(startContentJob).toHaveBeenCalledWith('churn');
  });
});
