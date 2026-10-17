import type { PlatformCredentials } from './clientCredentialsService';
import { isDatabaseConfigured } from '../db/client';
import { isEncryptionConfigured } from './cryptoService';
import { drizzleKeyStore } from '../db/repository';

export const BYOK_PLATFORMS = {
  deepseek: ['apiKey'],
  assemblyai: ['apiKey'],
  devto: ['apiKey'],
  linkedin: ['accessToken'],
  twitter: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'],
  // Workspace-scoped TryPost API token; the instance URL is TRYPOST_BASE_URL.
  trypost: ['apiToken']
} as const;

export type ByokPlatform = keyof typeof BYOK_PLATFORMS;

export function isByokPlatform(p: unknown): p is ByokPlatform {
  return typeof p === 'string' && Object.prototype.hasOwnProperty.call(BYOK_PLATFORMS, p);
}

export interface StoredKey {
  platform: string;
  entry: PlatformCredentials;
  updatedAt: Date;
}

export interface KeyStore {
  list(tenantId: string): Promise<StoredKey[]>;
  get(tenantId: string, platform: string): Promise<PlatformCredentials | null>;
  upsert(tenantId: string, platform: string, entry: PlatformCredentials): Promise<void>;
  remove(tenantId: string, platform: string): Promise<boolean>;
  /**
   * Compare-and-set: writes `entry` only if the row's current `updatedAt` still
   * equals `expectedUpdatedAt` (i.e. nothing has written to it since the caller
   * last read it). Returns false, without writing, when the row changed or is
   * gone — the caller decides what "changed" means (recordTest treats it as "a
   * newer key is in place, leave it alone").
   */
  replaceIfUnchanged(
    tenantId: string,
    platform: string,
    entry: PlatformCredentials,
    expectedUpdatedAt: Date
  ): Promise<boolean>;
}

export interface MaskedKey {
  platform: ByokPlatform;
  accountHandle: string | null;
  last4: string;
  updatedAt: string;
  lastTest: { ok: boolean; testedAt: string } | null;
}

export class KeyValidationError extends Error {
  constructor(message: string, public readonly allowedFields?: readonly string[]) {
    super(message);
    this.name = 'KeyValidationError';
  }
}

export class KeyStorageUnconfiguredError extends Error {
  constructor() {
    super('Key storage is not configured on this server.');
    this.name = 'KeyStorageUnconfiguredError';
  }
}

const MAX_SECRET_LENGTH = 4096;

function mask(secrets: Record<string, string>, platform: ByokPlatform): string {
  const primary = secrets[BYOK_PLATFORMS[platform][0]] || '';
  return primary.length < 8 ? '••••' : `••••${primary.slice(-4)}`;
}

/**
 * A signed-in user's own API keys. Every method takes the tenant id that
 * requireUser resolved from the verified token; nothing here accepts a name or
 * id from the request. Secrets leave this service only via getSecrets, for
 * server-side use (key tests now, voice and drafts in later sub-projects).
 */
export class WorkspaceKeysService {
  constructor(private readonly store: KeyStore, private readonly storageReady: () => boolean) {}

  private assertReady() {
    if (!this.storageReady()) throw new KeyStorageUnconfiguredError();
  }

  private toMasked(platform: ByokPlatform, entry: PlatformCredentials, updatedAt: Date): MaskedKey {
    return {
      platform,
      accountHandle: entry.accountHandle || null,
      last4: mask(entry.secrets || {}, platform),
      updatedAt: updatedAt.toISOString(),
      lastTest: entry.lastVerifiedAt ? { ok: entry.status === 'connected', testedAt: entry.lastVerifiedAt } : null
    };
  }

  public async list(tenantId: string): Promise<MaskedKey[]> {
    this.assertReady();
    const rows = await this.store.list(tenantId);
    return rows
      .filter((r) => isByokPlatform(r.platform))
      .map((r) => this.toMasked(r.platform as ByokPlatform, r.entry, r.updatedAt));
  }

  public async save(tenantId: string, platform: ByokPlatform, body: unknown): Promise<MaskedKey> {
    this.assertReady();
    const allowed = BYOK_PLATFORMS[platform];
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new KeyValidationError('Send the key fields as a JSON object.', allowed);
    }
    const { accountHandle, ...fields } = body as Record<string, unknown>;

    const unknownFields = Object.keys(fields).filter((f) => !(allowed as readonly string[]).includes(f));
    if (unknownFields.length) {
      throw new KeyValidationError(`Unknown field(s): ${unknownFields.join(', ')}.`, allowed);
    }

    const secrets: Record<string, string> = {};
    for (const field of allowed) {
      const raw = fields[field];
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!value) throw new KeyValidationError(`"${field}" is required.`, allowed);
      if (value.length > MAX_SECRET_LENGTH) throw new KeyValidationError(`"${field}" is too long.`, allowed);
      secrets[field] = value;
    }

    const handle = typeof accountHandle === 'string' && accountHandle.trim() ? accountHandle.trim().slice(0, 200) : undefined;
    const entry: PlatformCredentials = {
      secrets,
      accountHandle: handle,
      environment: 'cloud_production',
      autoPublishEnabled: false,
      status: 'connected'
    };
    await this.store.upsert(tenantId, platform, entry);

    const saved = (await this.store.list(tenantId)).find((r) => r.platform === platform);
    return this.toMasked(platform, entry, saved?.updatedAt ?? new Date());
  }

  public async remove(tenantId: string, platform: ByokPlatform): Promise<boolean> {
    this.assertReady();
    return this.store.remove(tenantId, platform);
  }

  public async getSecrets(tenantId: string, platform: ByokPlatform): Promise<Record<string, string> | null> {
    this.assertReady();
    const entry = await this.store.get(tenantId, platform);
    return entry && entry.secrets && Object.keys(entry.secrets).length ? entry.secrets : null;
  }

  public async recordTest(tenantId: string, platform: ByokPlatform, ok: boolean): Promise<{ ok: boolean; testedAt: string }> {
    this.assertReady();
    const testedAt = new Date().toISOString();
    // Read with the row's updatedAt (same pattern save() uses) so the write
    // below can be a compare-and-set: if a save() lands between this read and
    // that write, replaceIfUnchanged fails and we must not retry — a newer key
    // is in place, and blindly overwriting it would revert the user's own
    // just-saved key back to what this recordTest call started with.
    const row = (await this.store.list(tenantId)).find((r) => r.platform === platform);
    if (row) {
      const updated: PlatformCredentials = {
        ...row.entry,
        status: ok ? 'connected' : 'error',
        lastVerifiedAt: testedAt
      };
      await this.store.replaceIfUnchanged(tenantId, platform, updated, row.updatedAt);
    }
    return { ok, testedAt };
  }
}

export const workspaceKeysService = new WorkspaceKeysService(
  drizzleKeyStore,
  () => isDatabaseConfigured() && isEncryptionConfigured()
);
