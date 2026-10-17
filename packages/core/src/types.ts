/** Shared contract for the Content OS. Dates are ISO-8601 strings (UTC). */

export type AssetKind =
  | "brief"
  | "research"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "web"
  | "document";

/** Where an asset came from. `authorized` records whether we may reuse it. */
export interface Source {
  url?: string;
  license?: string;
  authorized: boolean;
  retrievedAt?: string;
}

export interface AssetInput {
  kind: AssetKind;
  title: string;
  /** Text content. Required unless `sha256` is given (for files held elsewhere). */
  body?: string;
  /** Hash of an externally stored file (for example a Drive file). */
  sha256?: string;
  /** Where the bytes live: a Drive file id, a path, or a URL. */
  uri?: string;
  /** Asset this one was derived from. Builds the lineage chain. */
  parent?: string;
  /** Tool or agent that produced it, for example "z-image" or "hermes". */
  tool: string;
  source?: Source;
  tags?: string[];
}

export interface Asset {
  id: string;
  kind: AssetKind;
  title: string;
  sha256: string;
  uri?: string;
  parent?: string;
  tool: string;
  source?: Source;
  tags: string[];
  created: string;
  /** Note path relative to the store root. */
  path: string;
}

export interface PutResult {
  asset: Asset;
  /** False when an identical asset already existed (a dedupe hit). */
  created: boolean;
}

export interface MemoryStore {
  put(input: AssetInput): Promise<PutResult>;
  get(id: string): Promise<Asset | null>;
  findByHash(sha256: string): Promise<Asset | null>;
  findBySourceUrl(url: string): Promise<Asset | null>;
  search(query: string, limit?: number): Promise<Asset[]>;
  /** Chain from the root ancestor down to the given asset. */
  lineage(id: string): Promise<Asset[]>;
}

/** Links an outbound or inbound event back to the content that caused it. */
export interface Signal {
  id: string;
  kind: "post" | "reply" | "call" | "form";
  assetId: string;
  channel: string;
  /** Opaque CRM id. Never put personal data in the vault. */
  contactId?: string;
  ts: string;
}

export interface CostEntry {
  runId: string;
  ts: string;
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  usd?: number;
  note?: string;
}

export interface AuditEntry {
  runId: string;
  ts: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface CostLedger {
  record(entry: Omit<CostEntry, "ts"> & { ts?: string }): Promise<void>;
  total(runId: string): Promise<{ usd: number; inputTokens: number; outputTokens: number; entries: number }>;
}
