import { SocialPublishingService } from '../services/socialPublishingService';

describe('SocialPublishingService', () => {
  const originalFlag = process.env.ENABLE_REAL_PUBLISHING;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ENABLE_REAL_PUBLISHING = originalFlag;
    global.fetch = originalFetch;
  });

  it('marks twitter/linkedin receipts as simulated when ENABLE_REAL_PUBLISHING is unset', async () => {
    delete process.env.ENABLE_REAL_PUBLISHING;
    const service = new SocialPublishingService();

    const result = await service.publishToConnectedPlatforms({
      companyName: 'Acme Coaching Co.',
      platforms: ['twitter', 'linkedin'],
      content: { thesis: 'Test thesis for simulated publishing' }
    });

    for (const receipt of result.receipts) {
      expect(receipt.isSimulated).toBe(true);
      expect(receipt.status).toBe('published');
    }
  });

  it('reports a failed (not silently published) status when the Substack webhook call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    const service = new SocialPublishingService();

    const result = await service.publishToConnectedPlatforms({
      companyName: 'Acme Coaching Co.',
      platforms: ['substack'],
      content: { thesis: 'Test thesis for substack failure path' }
    });

    const substackReceipt = result.receipts.find((r) => r.platform === 'substack');
    expect(substackReceipt).toBeDefined();
    expect(substackReceipt!.status).toBe('failed');
    // Nothing was published, so this is not a real post. The previous assertion
    // here required isSimulated:false, which meant a caller filtering on
    // `isSimulated === false` to mean "verified real" would count this failure
    // as a genuine live post. `status`/`details` still distinguish a failed
    // attempt from one that was never made.
    expect(substackReceipt!.isSimulated).toBe(true);
    expect(substackReceipt!.details).toMatch(/failed/i);
    expect(substackReceipt!.postUrl).toBe('');
  });

  it('labels youtube as stub_unsupported rather than pretending to publish', async () => {
    const service = new SocialPublishingService();
    const result = await service.publishToConnectedPlatforms({
      companyName: 'Acme Coaching Co.',
      platforms: ['youtube'],
      content: { thesis: 'Test thesis for youtube stub' }
    });

    const youtubeReceipt = result.receipts.find((r) => r.platform === 'youtube');
    expect(youtubeReceipt).toBeDefined();
    expect(youtubeReceipt!.status).toBe('stub_unsupported');
    expect(youtubeReceipt!.isSimulated).toBe(true);
  });
});
