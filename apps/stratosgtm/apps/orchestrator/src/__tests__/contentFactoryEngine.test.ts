import { ContentFactoryEngine } from '../services/contentFactoryEngine';

describe('ContentFactoryEngine.startJob (DeepSeek fallback path, no network)', () => {
  it('reaches needs_approval with a populated, length-trimmed content pack', async () => {
    const engine = new ContentFactoryEngine();

    const finished = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Job did not finish in time')), 10000);
      engine.setUpdateListener((job) => {
        if (job.status === 'needs_approval' || job.status === 'failed') {
          clearTimeout(timeout);
          resolve(job);
        }
      });
      engine.startJob('How to scale a creator business', 'creator');
    });

    expect(finished.status).toBe('needs_approval');
    expect(finished.contentPack).toBeDefined();
    expect(Array.isArray(finished.contentPack.twitterThread)).toBe(true);
    expect(finished.contentPack.twitterThread.length).toBeGreaterThan(0);
    for (const tweet of finished.contentPack.twitterThread) {
      expect(tweet.length).toBeLessThanOrEqual(280);
    }
  }, 15000);
});
