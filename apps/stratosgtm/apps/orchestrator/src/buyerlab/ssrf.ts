import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export class UnsafeUrlError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];

function v4ToInt(ip: string): number {
  const p = ip.split('.').map(Number);
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function inV4Block(ip: string, [base, bits]: [string, number]): boolean {
  const mask = (~0 << (32 - bits)) >>> 0;
  return ((v4ToInt(ip) & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
}

/** Eight 16-bit groups, or null if `input` is not a valid IPv6 literal. */
function parseIPv6(input: string): number[] | null {
  let ip = input.split('%')[0];
  let tail: number[] = [];
  const v4 = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (isIP(v4[1]) !== 4) return null;
    const n = v4[1].split('.').map(Number);
    tail = [(n[0] << 8) | n[1], (n[2] << 8) | n[3]];
    ip = ip.slice(0, -v4[1].length) + '0:0';
  }
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const rest = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (parts.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = parts.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  if (nums.length !== 8 || nums.some(Number.isNaN)) return null;
  if (v4) {
    nums[6] = tail[0];
    nums[7] = tail[1];
  }
  return nums;
}

const embedded = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;

/** True if `ip` must never be fetched. Fails closed: anything unparseable is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return V4_BLOCKS.some((b) => inV4Block(ip, b));
  if (version !== 6) return true;
  const g = parseIPv6(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isBlockedAddress(embedded(g[6], g[7])); // mapped / compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedAddress(embedded(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isBlockedAddress(embedded(g[1], g[2])); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const defaultResolver: Resolver = async (hostname) => {
  const rows = await lookup(hostname, { all: true });
  return rows.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
};

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.internal', '.local'];

/**
 * Validates a URL BEFORE any request is made and returns the address the caller must
 * connect to. Connecting to this address (not re-resolving the name) is what stops DNS
 * rebinding: the check and the connection see the same IP.
 */
export async function assertPublicUrl(
  rawUrl: string,
  resolve: Resolver = defaultResolver
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.', 'bad_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError('Only http and https URLs are allowed.', 'bad_scheme');
  if (url.username || url.password) throw new UnsafeUrlError('URLs with credentials are not allowed.', 'credentials_in_url');
  if (url.port && url.port !== '80' && url.port !== '443') throw new UnsafeUrlError('Only ports 80 and 443 are allowed.', 'bad_port');

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError('That host name is not allowed.', 'blocked_hostname');
  }

  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError('That address is not allowed.', 'private_address');
    return { url, address: host, family: isIP(host) as 4 | 6 };
  }

  let answers: Awaited<ReturnType<Resolver>>;
  try {
    answers = await resolve(host);
  } catch {
    throw new UnsafeUrlError('That host name did not resolve.', 'dns_failure');
  }
  if (answers.length === 0) throw new UnsafeUrlError('That host name did not resolve.', 'dns_failure');
  if (answers.some((a) => isBlockedAddress(a.address))) throw new UnsafeUrlError('That host resolves to a private address.', 'private_address');
  return { url, address: answers[0].address, family: answers[0].family };
}
