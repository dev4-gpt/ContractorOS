import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_NAMESPACE } from "./vaultStore.js";

/**
 * One shared do-not-contact list for every sender (email engine, outreach,
 * voice agent). Stores sha256 hashes of normalized identifiers, never raw
 * emails or phone numbers. An opt-out for a business blocks its email,
 * domain and phone at once.
 */
export type SuppressionType = "email" | "domain" | "phone";

export interface Candidate {
  email?: string;
  /** A website URL or bare domain. */
  website?: string;
  phone?: string;
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com",
  "icloud.com", "proton.me", "protonmail.com", "aol.com",
]);

function domainOf(value: string): string {
  const withScheme = value.includes("://") ? value : `https://${value}`;
  const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) throw new Error(`not a domain: ${value}`);
  return host;
}

export function normalizeIdentifier(type: SuppressionType, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`empty ${type}`);
  if (type === "email") {
    const email = trimmed.toLowerCase();
    if (email.split("@").length !== 2 || !email.split("@")[1]?.includes(".")) {
      throw new Error(`not an email: ${value}`);
    }
    return email;
  }
  if (type === "phone") {
    // Last ten digits, so "+1 (555) 010-2222", "555.010.2222" and "15550102222" all match.
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 7) throw new Error(`not a phone number: ${value}`);
    return digits.slice(-10);
  }
  const domain = domainOf(trimmed);
  if (FREE_MAIL.has(domain)) throw new Error(`refusing to suppress a shared mail domain: ${domain}`);
  return domain;
}

export function suppressionKey(type: SuppressionType, value: string): string {
  const hash = createHash("sha256").update(normalizeIdentifier(type, value)).digest("hex");
  return `${type}:${hash}`;
}

export function suppressionFile(root: string, namespaceDir = DEFAULT_NAMESPACE): string {
  return path.join(root, namespaceDir, "Suppression.md");
}

const HEADER = [
  "# Suppression list",
  "",
  "Hashed identifiers (sha256 of the normalized value). Append-only. Do not edit by hand.",
  "",
].join("\n");

export class Suppression {
  constructor(private readonly file: string, private readonly now: () => Date = () => new Date()) {}

  private async keys(): Promise<Set<string>> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
      throw error;
    }
    const keys = new Set<string>();
    for (const line of text.split("\n")) {
      if (!line.startsWith("- ")) continue;
      keys.add(line.slice(2).split(" | ")[0]!.trim());
    }
    return keys;
  }

  /** Returns true if newly added, false if it was already listed. */
  async add(type: SuppressionType, value: string, reason = "opt-out"): Promise<boolean> {
    const key = suppressionKey(type, value);
    if ((await this.keys()).has(key)) return false;
    await mkdir(path.dirname(this.file), { recursive: true });
    let prefix = "";
    try {
      await readFile(this.file, "utf8");
    } catch {
      prefix = HEADER;
    }
    const safeReason = reason.replace(/[\r\n|]/g, " ").slice(0, 120);
    await appendFile(this.file, `${prefix}- ${key} | ${this.now().toISOString()} | ${safeReason}\n`, "utf8");
    return true;
  }

  /** Suppress everything known about one contact. The domain comes from `website` only. */
  async addContact(candidate: Candidate & { reason?: string }): Promise<SuppressionType[]> {
    const added: SuppressionType[] = [];
    const reason = candidate.reason ?? "opt-out";
    if (candidate.email && (await this.add("email", candidate.email, reason))) added.push("email");
    if (candidate.website && (await this.add("domain", candidate.website, reason))) added.push("domain");
    if (candidate.phone && (await this.add("phone", candidate.phone, reason))) added.push("phone");
    return added;
  }

  /** Blocked if any identifier matches. An email also matches a suppressed domain. */
  async check(candidate: Candidate): Promise<{ blocked: boolean; matches: SuppressionType[] }> {
    const keys = await this.keys();
    const matches: SuppressionType[] = [];
    if (candidate.email) {
      if (keys.has(suppressionKey("email", candidate.email))) matches.push("email");
      const emailDomain = normalizeIdentifier("email", candidate.email).split("@")[1]!;
      if (!FREE_MAIL.has(emailDomain) && keys.has(suppressionKey("domain", emailDomain))) matches.push("domain");
    }
    if (candidate.website && !matches.includes("domain")) {
      if (keys.has(suppressionKey("domain", candidate.website))) matches.push("domain");
    }
    if (candidate.phone && keys.has(suppressionKey("phone", candidate.phone))) matches.push("phone");
    return { blocked: matches.length > 0, matches };
  }
}
