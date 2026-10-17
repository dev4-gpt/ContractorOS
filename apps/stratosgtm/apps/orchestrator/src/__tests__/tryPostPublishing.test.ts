import { publishViaTryPost } from '../services/tryPostPublishing';

const accounts = ['a', 'b', 'c'].map((id) => ({ id, platform: 'bluesky', displayName: '', username: id, active: true }));

it('after the deadline, remaining accounts are queued and simulated, never published', async () => {
  let t = 0;
  const publish = jest.fn(async () => {
    t += 30_000;
    return { attemptedRealCall: true, succeeded: true, state: 'published' as const, postId: 'p', details: 'ok' };
  });
  const client = { listAccounts: jest.fn(), publish };
  const receipts = await publishViaTryPost(client, 'tok', 'hi', ['a', 'b', 'c'], true, accounts, { totalMs: 45_000, now: () => t });
  expect(receipts.map((r) => r.status)).toEqual(['published', 'published', 'queued']);
  expect(receipts[2].isSimulated).toBe(true);
  expect(publish).toHaveBeenCalledTimes(2);
});
