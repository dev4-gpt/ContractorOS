import * as fs from 'fs';
import * as path from 'path';
import { isDatabaseConfigured } from '../db/client';
import {
  upsertPlatformCredential,
  deletePlatformCredential,
  listAllPlatformCredentials
} from '../db/repository';

export interface PlatformCredentials {
  secrets: Record<string, string>;
  accountHandle?: string;
  profileName?: string;
  environment: 'cloud_production' | 'cloud_sandbox' | 'local';
  autoPublishEnabled: boolean;
  status: 'connected' | 'unconfigured' | 'verifying' | 'error';
  lastVerifiedAt?: string;
  latencyMs?: number;
  lastError?: string;
}

export interface MaskedPlatformCredential {
  platform: string;
  accountHandle?: string;
  profileName?: string;
  environment: 'cloud_production' | 'cloud_sandbox' | 'local';
  autoPublishEnabled: boolean;
  status: 'connected' | 'unconfigured' | 'verifying' | 'error';
  lastVerifiedAt?: string;
  latencyMs?: number;
  maskedFields: Record<string, string>;
  hasSecrets: boolean;
}

export interface ClientCredentialsRecord {
  clientId: string;
  clientName: string;
  companyName: string;
  updatedAt: string;
  platforms: Record<string, PlatformCredentials>;
}

/**
 * Per-client third-party credentials.
 *
 * Write-through cache over the encrypted `platform_credentials` table: reads stay
 * in memory, every change is encrypted and persisted, and stored credentials are
 * decrypted back in on boot. Writes are tracked so routes can await them before
 * responding — an unawaited write can be dropped when a serverless host freezes.
 */
export class ClientCredentialsService {
  private memoryStore: Map<string, ClientCredentialsRecord> = new Map();
  private vaultBasePath: string;
  private pendingWrites = new Set<Promise<void>>();

  /** Resolves once stored credentials have been decrypted into memory. */
  public readonly ready: Promise<void>;

  constructor() {
    this.vaultBasePath = path.resolve(process.cwd(), 'vault');
    this.seedInitialCredentials();
    this.ready = this.hydrate();
  }

  /** Waits for every in-flight credential write to settle. */
  public async flush(): Promise<void> {
    await Promise.allSettled(Array.from(this.pendingWrites));
  }

  private track(write: Promise<void>, what: string): void {
    const tracked = write.catch((err) => {
      console.error(`[Credentials] Failed to persist ${what}:`, err?.message || err);
    });
    this.pendingWrites.add(tracked);
    void tracked.finally(() => this.pendingWrites.delete(tracked));
  }

  /**
   * Loads stored credentials over the in-memory seed. Stored entries win for the
   * same client and platform: the database holds what the customer actually
   * configured, the seed only exists so a fresh demo has something to show.
   */
  private async hydrate(): Promise<void> {
    if (!isDatabaseConfigured()) return;
    try {
      const stored = await listAllPlatformCredentials();
      for (const { tenantId, companyName, platform, entry } of stored) {
        let record = this.getClientRecord(companyName);
        if (!record) {
          record = {
            clientId: tenantId,
            clientName: companyName,
            companyName,
            updatedAt: new Date().toISOString(),
            platforms: {}
          };
          this.memoryStore.set(companyName.toLowerCase().trim(), record);
          this.memoryStore.set(tenantId.toLowerCase(), record);
        }
        record.platforms[platform] = entry;
      }
    } catch (err: any) {
      console.error('[Credentials] Hydration failed; serving in-memory credentials only:', err?.message || err);
    }
  }

  private maskSecret(val: string): string {
    if (!val) return '';
    if (val.length <= 8) return '••••••••';
    const start = val.slice(0, 4);
    const end = val.slice(-4);
    return `${start}••••••••${end}`;
  }

  private getSafeClientName(identifier: string): string {
    return identifier.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private seedInitialCredentials() {
    // Seed default credentials for Acme Coaching Co.
    this.saveCredentialsInternal('Acme Coaching Co.', 'lead_ak_901', 'Alex Kim', {
      twitter: {
        secrets: {
          apiKey: 'xak_live_8917240182741029',
          apiSecret: 'xs_sec_991823019283019283019283',
          accessToken: 'xtok_1092830192-9182039182039182039',
          tokenSecret: 'xts_9182039182039182039182039182',
          bearerToken: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs'
        },
        accountHandle: '@acmecoaching',
        profileName: 'Acme Coaching Co. Official',
        environment: 'cloud_production',
        autoPublishEnabled: true,
        status: 'connected',
        lastVerifiedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        latencyMs: 38
      },
      linkedin: {
        secrets: {
          clientId: 'li_client_86x90qkmz2',
          clientSecret: 'li_sec_kLmNoPqRsTuVwXyZ',
          accessToken: 'AQV9x8y7z6w5v4u3t2s1r0q-live-token'
        },
        accountHandle: 'alexkim-coaching',
        profileName: 'Alex Kim (Founder)',
        environment: 'cloud_production',
        autoPublishEnabled: true,
        status: 'connected',
        lastVerifiedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        latencyMs: 44
      },
      substack: {
        secrets: {
          webhookUrl: 'https://api.substack.com/v1/publish/hook_da_901',
          bearerToken: 'sub_live_9928102938102938'
        },
        accountHandle: 'alexkim.substack.com',
        profileName: 'The High-Ticket Design Sprint',
        environment: 'cloud_production',
        autoPublishEnabled: false,
        status: 'connected',
        lastVerifiedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        latencyMs: 52
      },
      youtube: {
        secrets: {
          apiKey: 'AIzaSyA8_youtube_api_key_889210',
          channelId: 'UC_acmecoaching_channel'
        },
        accountHandle: '@acmecoaching',
        profileName: 'Acme Coaching Co. Videos',
        environment: 'cloud_sandbox',
        autoPublishEnabled: false,
        status: 'connected',
        lastVerifiedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        latencyMs: 65
      }
    });

    // Seed default credentials for Veloce AgenticOS
    this.saveCredentialsInternal('Veloce AgenticOS', 'lead_veloce_01', 'Veloce Founder', {
      twitter: {
        secrets: {
          apiKey: 'xak_live_veloce_9918230192',
          apiSecret: 'xs_sec_veloce_391820391820',
          bearerToken: 'Bearer AAAAAAAAAAAAAAAAAAAAAVELOCE_KEY_8819203'
        },
        accountHandle: '@VeloceAgenticOS',
        profileName: 'Veloce AgenticOS Sovereign Ops',
        environment: 'cloud_production',
        autoPublishEnabled: true,
        status: 'connected',
        lastVerifiedAt: new Date().toISOString(),
        latencyMs: 32
      },
      linkedin: {
        secrets: {
          clientId: 'li_veloce_9912',
          accessToken: 'AQV_veloce_enterprise_li_token'
        },
        accountHandle: 'company/veloce-agenticos',
        profileName: 'Veloce AgenticOS Enterprise',
        environment: 'cloud_production',
        autoPublishEnabled: true,
        status: 'connected',
        lastVerifiedAt: new Date().toISOString(),
        latencyMs: 41
      }
    });
  }

  private saveCredentialsInternal(
    companyName: string,
    clientId: string,
    clientName: string,
    platforms: Record<string, PlatformCredentials>
  ) {
    const key = companyName.toLowerCase().trim();
    const record: ClientCredentialsRecord = {
      clientId,
      clientName,
      companyName,
      updatedAt: new Date().toISOString(),
      platforms
    };

    this.memoryStore.set(key, record);
    this.memoryStore.set(clientId.toLowerCase().trim(), record);
    this.syncToVault(record);
  }

  public getClientRecord(identifier: string): ClientCredentialsRecord | null {
    const key = identifier.toLowerCase().trim();
    return this.memoryStore.get(key) || null;
  }

  public getOrCreateClientRecord(identifier: string, clientName?: string): ClientCredentialsRecord {
    const existing = this.getClientRecord(identifier);
    if (existing) return existing;

    const safeName = identifier.trim();
    const record: ClientCredentialsRecord = {
      clientId: `client_${Date.now().toString(36)}`,
      clientName: clientName || `${safeName} Lead`,
      companyName: safeName,
      updatedAt: new Date().toISOString(),
      platforms: {}
    };

    this.memoryStore.set(safeName.toLowerCase(), record);
    this.memoryStore.set(record.clientId.toLowerCase(), record);
    this.syncToVault(record);
    return record;
  }

  public getMaskedCredentials(identifier: string): {
    companyName: string;
    clientId: string;
    platforms: MaskedPlatformCredential[];
  } {
    const record = this.getOrCreateClientRecord(identifier);
    const standardPlatforms = ['twitter', 'linkedin', 'youtube', 'substack', 'meta', 'cloud_storage'];
    const result: MaskedPlatformCredential[] = [];

    // Map existing or unconfigured standard platforms
    standardPlatforms.forEach((p) => {
      const entry = record.platforms[p];
      if (entry) {
        const maskedFields: Record<string, string> = {};
        Object.keys(entry.secrets || {}).forEach((k) => {
          maskedFields[k] = this.maskSecret(entry.secrets[k]);
        });

        result.push({
          platform: p,
          accountHandle: entry.accountHandle,
          profileName: entry.profileName,
          environment: entry.environment || 'cloud_production',
          autoPublishEnabled: entry.autoPublishEnabled ?? false,
          status: entry.status || 'connected',
          lastVerifiedAt: entry.lastVerifiedAt,
          latencyMs: entry.latencyMs,
          maskedFields,
          hasSecrets: Object.keys(entry.secrets || {}).length > 0
        });
      } else {
        result.push({
          platform: p,
          environment: 'cloud_production',
          autoPublishEnabled: false,
          status: 'unconfigured',
          maskedFields: {},
          hasSecrets: false
        });
      }
    });

    return {
      companyName: record.companyName,
      clientId: record.clientId,
      platforms: result
    };
  }

  public async setPlatformCredentials(params: {
    identifier: string;
    platform: string;
    secrets: Record<string, string>;
    accountHandle?: string;
    profileName?: string;
    environment?: 'cloud_production' | 'cloud_sandbox' | 'local';
    autoPublishEnabled?: boolean;
  }): Promise<MaskedPlatformCredential> {
    const record = this.getOrCreateClientRecord(params.identifier);
    const platformKey = params.platform.toLowerCase().trim();

    const existingPlatform = record.platforms[platformKey];
    const mergedSecrets = { ...(existingPlatform?.secrets || {}), ...params.secrets };

    // Remove empty keys
    Object.keys(mergedSecrets).forEach((k) => {
      if (!mergedSecrets[k] || mergedSecrets[k].trim() === '') {
        delete mergedSecrets[k];
      }
    });

    const isConnected = Object.keys(mergedSecrets).length > 0;

    record.platforms[platformKey] = {
      secrets: mergedSecrets,
      accountHandle: params.accountHandle || existingPlatform?.accountHandle,
      profileName: params.profileName || existingPlatform?.profileName,
      environment: params.environment || existingPlatform?.environment || 'cloud_production',
      autoPublishEnabled: params.autoPublishEnabled !== undefined ? params.autoPublishEnabled : (existingPlatform?.autoPublishEnabled ?? true),
      status: isConnected ? 'connected' : 'unconfigured',
      // Saving keys is not verifying them, so no verification time is recorded
      // here. A random "latency" used to be invented at this point.
      lastVerifiedAt: existingPlatform?.lastVerifiedAt,
      latencyMs: undefined
    };

    record.updatedAt = new Date().toISOString();
    this.syncToVault(record);
    this.track(
      upsertPlatformCredential(record.companyName, platformKey, record.platforms[platformKey]),
      `${platformKey} for ${record.companyName}`
    );

    const masked = this.getMaskedCredentials(params.identifier);
    return masked.platforms.find((p) => p.platform === platformKey)!;
  }

  /**
   * Reports whether credentials are present and complete.
   *
   * It does NOT contact the platform. This previously slept for a random 45-85ms
   * and returned "Verified connection to TWITTER ... in 62ms", a handshake that
   * never happened, with the sleep dressed up as network latency. `verified:
   * false` says plainly that nothing was tested; a real check needs a per-platform
   * authenticated call (e.g. X `GET /2/users/me`), which is not implemented yet.
   */
  public async verifyPlatform(identifier: string, platform: string): Promise<{
    success: boolean;
    status: 'connected' | 'error';
    latencyMs: number;
    message: string;
    accountHandle?: string;
    verified: boolean;
  }> {
    const record = this.getClientRecord(identifier);
    const platformKey = platform.toLowerCase().trim();
    const cred = record?.platforms[platformKey];

    if (!cred || !cred.secrets || Object.keys(cred.secrets).length === 0) {
      return {
        success: false,
        status: 'error',
        latencyMs: 0,
        verified: false,
        message: `No credentials configured for platform "${platform}". Please enter API keys first.`
      };
    }

    return {
      success: true,
      status: 'connected',
      latencyMs: 0,
      verified: false,
      message: `Credentials for ${platform.toUpperCase()} (${cred.accountHandle || 'no handle set'}) are stored and encrypted, but were not tested against ${platform.toUpperCase()}'s API — live verification is not implemented yet. The first real publish will surface any bad key.`,
      accountHandle: cred.accountHandle
    };
  }

  public deletePlatform(identifier: string, platform: string): boolean {
    const record = this.getClientRecord(identifier);
    if (!record) return false;

    const platformKey = platform.toLowerCase().trim();
    if (record.platforms[platformKey]) {
      delete record.platforms[platformKey];
      record.updatedAt = new Date().toISOString();
      this.syncToVault(record);
      this.track(deletePlatformCredential(record.companyName, platformKey), `delete ${platformKey}`);
      return true;
    }
    return false;
  }

  public getRawPlatformSecrets(identifier: string, platform: string): PlatformCredentials | null {
    const record = this.getClientRecord(identifier);
    if (!record) return null;
    return record.platforms[platform.toLowerCase().trim()] || null;
  }

  private syncToVault(record: ClientCredentialsRecord) {
    try {
      const safeName = this.getSafeClientName(record.companyName);
      const clientDir = path.join(this.vaultBasePath, 'Clients', safeName);
      if (!fs.existsSync(clientDir)) {
        fs.mkdirSync(clientDir, { recursive: true });
      }

      // 1. Write a MASKED credentials summary. This used to write the full record,
      // plaintext tokens included, under a comment claiming it was encrypted — and
      // the demo client's copy was committed to git. The real secrets now live
      // only in memory and, encrypted, in Postgres; this file never holds one.
      const credFile = path.join(clientDir, 'Credentials.json');
      const masked = {
        ...record,
        platforms: Object.fromEntries(
          Object.entries(record.platforms).map(([plat, info]) => [
            plat,
            {
              ...info,
              secrets: Object.fromEntries(
                Object.entries(info.secrets || {}).map(([k, v]) => [k, this.maskSecret(v)])
              )
            }
          ])
        )
      };
      fs.writeFileSync(credFile, JSON.stringify(masked, null, 2), 'utf-8');

      // 2. Write Obsidian markdown summary
      const mdFile = path.join(clientDir, 'ConnectedPlatforms.md');
      const platformEntries = Object.entries(record.platforms).map(([plat, info]) => {
        return `### 🔌 ${plat.toUpperCase()} (${info.status.toUpperCase()})
* **Handle / Profile:** ${info.accountHandle || info.profileName || 'Default'}
* **Environment:** \`${info.environment}\`
* **Auto-Publish Pipeline:** ${info.autoPublishEnabled ? '✅ ENABLED' : '⏸️ PAUSED'}
* **Last Verified:** ${info.lastVerifiedAt || 'Pending'}
* **API Latency:** ${info.latencyMs ? info.latencyMs + 'ms' : 'N/A'}
* **Configured Keys:** ${Object.keys(info.secrets || {}).map(k => `\`${k}\``).join(', ')}
`;
      }).join('\n');

      const mdContent = `# 🔑 Connected Platforms & Cloud Credentials: ${record.companyName}

**Client ID:** \`${record.clientId}\`  
**Last Updated:** ${record.updatedAt}  
**Vault Path:** \`vault/Clients/${safeName}/Credentials.json\`  

> [!NOTE]
> Credentials for this client are isolated in this directory. When Anna executes autonomous thought leadership publishing, this client's connected tokens are utilized.

---

## 📡 Platform Integrations

${platformEntries || '*No platforms connected yet. Configure in Content Factory Studio.*'}
`;
      fs.writeFileSync(mdFile, mdContent, 'utf-8');
    } catch (err: any) {
      console.error('[Credentials Vault Sync Error]', err.message);
    }
  }
}

export const clientCredentialsService = new ClientCredentialsService();
