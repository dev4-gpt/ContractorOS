import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeHostError';
  }
}

export type Lookup = (hostname: string) => Promise<{ address: string }[]>;

export const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true });

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map(Number);
  const [a, b] = [p[0] ?? 0, p[1] ?? 0];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) return ipv4Private(v);
  if (v === '::1' || v === '::') return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return ipv4Private(mapped[1]);
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

/** Refuses hosts that resolve to loopback, private, link-local or otherwise non-public addresses. */
export async function assertPublicHost(hostname: string, lookup: Lookup = defaultLookup): Promise<void> {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeHostError(`Refusing to fetch ${hostname}: not a public host.`);
  }
  if (isIP(host) && isPrivateAddress(host)) throw new UnsafeHostError(`Refusing to fetch ${hostname}: private address.`);
  if (isIP(host)) return;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new UnsafeHostError(`Could not resolve ${hostname}.`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeHostError(`Refusing to fetch ${hostname}: it resolves to a non-public address.`);
  }
}
