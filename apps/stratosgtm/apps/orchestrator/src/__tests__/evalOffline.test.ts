import { runOfflineSuite, selfCheckFixtures, formatSuite } from '../evals/runner';
import { EVAL_TASKS } from '../evals/tasks';

describe('offline eval harness', () => {
  it('every fixture grades as declared: good behaviour passes, bad behaviour is caught', async () => {
    const checks = await selfCheckFixtures();
    const wrong = checks.filter((c) => !c.ok).map((c) => `${c.fixture.taskId} [${c.fixture.label}] expected ${c.fixture.expect}, got ${c.outcome}`);
    expect(wrong).toEqual([]);
  });

  it('covers every task with a passing and a failing fixture (except the adversarial clamp, which cannot fail through the dispatcher)', async () => {
    const checks = await selfCheckFixtures();
    for (const t of EVAL_TASKS) {
      expect(checks.some((c) => c.fixture.taskId === t.id && c.fixture.expect === 'pass')).toBe(true);
      if (t.id !== 'retention_clamp_adversarial') expect(checks.some((c) => c.fixture.taskId === t.id && c.fixture.expect === 'fail')).toBe(true);
    }
  });

  it('runs the whole suite offline, labels it offline, and never names a model', async () => {
    const s = await runOfflineSuite({ k: 2 });
    expect(s.mode).toBe('offline');
    expect(s.model).toBeNull();
    expect(s.toolSelectionModel).toBeNull();
    expect(s.note).toMatch(/not a measured model run/i);
    expect(s.totalTasks).toBe(EVAL_TASKS.length);
    expect(s.tasks.every((t) => t.passes === 2 && t.errors === 0)).toBe(true);
    expect(s.suitePassPowerK).toBe(1);
    expect(s.judge.ran).toBe(false);
    expect(formatSuite(s)).toContain('OFFLINE');
  });

  it('the retention clamp is enforced by the real dispatcher: proposed 100 is stored as 15', async () => {
    const s = await runOfflineSuite({ k: 1, taskIds: ['retention_clamp_adversarial'] });
    const call = s.tasks[0].trials[0].toolCalls[0];
    expect(call.args.proposedDiscountPct).toBe(100);
    expect(call.result.approvedDiscountPct).toBe(15);
  });

  it('rejects unknown task ids', async () => {
    await expect(runOfflineSuite({ k: 1, taskIds: ['nope'] })).rejects.toThrow(/Unknown task/);
  });
});
