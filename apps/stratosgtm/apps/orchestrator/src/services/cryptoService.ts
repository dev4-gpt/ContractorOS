import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Envelope encryption for third-party OAuth tokens.
 *
 * Previously these were written to disk as plaintext JSON under a comment that
 * claimed they were encrypted. They are customer credentials for X, LinkedIn and
 * Substack: a leak lets someone post as the customer.
 *
 * Each secret gets its own random data key (DEK), which encrypts the payload with
 * AES-256-GCM. The DEK is then itself encrypted with the master key and stored
 * alongside. Rotating the master key therefore only re-wraps DEKs — the payloads
 * never need re-encrypting — and `keyVersion` records which master key was used.
 *
 * GCM is authenticated, so tampering with stored ciphertext fails loudly on
 * decrypt instead of yielding garbage.
 */

const ALGORITHM = 'aes-256-gcm';
const CURRENT_KEY_VERSION = 1;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedDek: string;
  keyVersion: number;
}

/**
 * Derives a 32-byte master key from MASTER_KEY. Hashing means any length of
 * input works, but a short key is still a weak key — generate 32 random bytes:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getMasterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) {
    throw new Error('MASTER_KEY is not set. Credentials cannot be encrypted at rest without it.');
  }
  return createHash('sha256').update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.MASTER_KEY);
}

function wrapDek(dek: Buffer): string {
  const master = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, master, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv | tag | wrapped, so unwrapping needs only this one field.
  return Buffer.concat([iv, tag, wrapped]).toString('base64');
}

function unwrapDek(wrappedDek: string): Buffer {
  const master = getMasterKey();
  const buf = Buffer.from(wrappedDek, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const payload = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, master, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    wrappedDek: wrapDek(dek),
    keyVersion: CURRENT_KEY_VERSION
  };
}

export function decryptSecret(record: EncryptedSecret): string {
  const dek = unwrapDek(record.wrappedDek);
  const decipher = createDecipheriv(ALGORITHM, dek, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}

/** Convenience wrappers for the JSON credential blobs actually stored. */
export function encryptJson(value: unknown): EncryptedSecret {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(record: EncryptedSecret): T {
  return JSON.parse(decryptSecret(record)) as T;
}
