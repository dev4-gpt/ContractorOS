import { socialPublishingService, PlatformPublishReceipt } from './socialPublishingService';
import { contentTypeFor, safeHttpUrl, type AccountsResult, type PublishResult, type TryPostAccount } from './tryPostService';

export interface TryPostClient {
  listAccounts(token: string): Promise<AccountsResult>;
  publish(token: string, input: { accountId: string; contentType: string; text: string }): Promise<PublishResult>;
}

/**
 * Publishes `text` to each requested TryPost account and returns one receipt per
 * account. Accounts are resolved from the caller's own workspace token, so an id
 * that is not in that list is refused here rather than sent upstream. Every
 * receipt goes through the shared deriveReceipt, so `isSimulated` is false only
 * when TryPost confirmed the post as published.
 */
export async function publishViaTryPost(
  client: TryPostClient,
  token: string,
  text: string,
  accountIds: string[],
  realPublishingEnabled: boolean,
  known: TryPostAccount[],
  budget: { totalMs?: number; now?: () => number } = {}
): Promise<PlatformPublishReceipt[]> {
  const now = budget.now ?? Date.now;
  const deadline = now() + (budget.totalMs ?? 45_000);
  const excerpt = text.slice(0, 120);
  const receipts: PlatformPublishReceipt[] = [];

  for (const id of accountIds) {
    const started = Date.now();
    const receipt = (
      status: PlatformPublishReceipt['status'],
      details: string,
      extra: { attempted?: boolean; succeeded?: boolean; postId?: string; postUrl?: string; handle?: string } = {}
    ) =>
      socialPublishingService.deriveReceipt({
        platform: 'trypost',
        status,
        attemptedRealCall: extra.attempted ?? false,
        succeeded: extra.succeeded ?? false,
        postId: extra.postId,
        postUrl: extra.postUrl,
        accountHandle: extra.handle ?? '',
        latencyMs: Date.now() - started,
        details,
        contentExcerpt: excerpt,
        publishedAt: new Date().toISOString()
      });

    const account = known.find((a) => a.id === id);
    if (!account || !account.active) {
      receipts.push(receipt('failed', 'This account is not connected in your TryPost workspace.'));
      continue;
    }
    const handle = account.username || account.displayName;
    const contentType = contentTypeFor(account.platform);
    if (!contentType) {
      receipts.push(receipt('failed', `Text-only posts to this account's network are not supported here (it needs media).`, { handle }));
      continue;
    }
    if (!realPublishingEnabled) {
      receipts.push(receipt('simulated_live', `Simulated: real publishing is disabled, nothing was sent to ${account.platform}.`, { handle }));
      continue;
    }

    if (now() >= deadline) {
      receipts.push(receipt('queued', 'Not attempted: this request ran out of time. Nothing was sent; retry this account.', { handle }));
      continue;
    }

    const result = await client.publish(token, { accountId: id, contentType, text });
    const status: PlatformPublishReceipt['status'] = result.succeeded ? 'published' : result.state === 'pending' ? 'queued' : 'failed';
    receipts.push(
      receipt(status, result.details, {
        attempted: result.attemptedRealCall,
        succeeded: result.succeeded,
        postId: result.postId,
        postUrl: safeHttpUrl(result.postUrl),
        handle
      })
    );
  }
  return receipts;
}
