import { isBlockedAddress, assertPublicUrl, UnsafeUrlError, Resolver } from '../../buyerlab/ssrf';

const BLOCKED = [
  '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
  '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1',
  '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::',
  'not-an-ip'
];
const ALLOWED = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.255.255', '2606:4700:4700::1111'];

describe('isBlockedAddress', () => {
  it.each(BLOCKED)('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(ALLOWED)('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

const publicResolver: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const reason = async (url: string, resolver: Resolver = publicResolver) => {
  try {
    await assertPublicUrl(url, resolver);
    return 'allowed';
  } catch (e) {
    return e instanceof UnsafeUrlError ? e.reason : `other:${(e as Error).message}`;
  }
};

describe('assertPublicUrl', () => {
  it.each([
    ['http://localhost/', 'blocked_hostname'],
    ['http://app.localhost/', 'blocked_hostname'],
    ['http://metadata.internal/', 'blocked_hostname'],
    ['http://printer.local/', 'blocked_hostname'],
    ['http://127.0.0.1/', 'private_address'],
    ['http://2130706433/', 'private_address'],
    ['http://0x7f.0.0.1/', 'private_address'],
    ['http://[::1]/', 'private_address'],
    ['http://169.254.169.254/latest/meta-data/', 'private_address'],
    ['ftp://example.com/', 'bad_scheme'],
    ['file:///etc/passwd', 'bad_scheme'],
    ['javascript:alert(1)', 'bad_scheme'],
    ['http://user:pw@example.com/', 'credentials_in_url'],
    ['http://example.com:8080/', 'bad_port'],
    ['not a url', 'bad_url']
  ])('rejects %s (%s)', async (url, expected) => expect(await reason(url)).toBe(expected));

  it('rejects a DNS name that resolves to a private address', async () => {
    expect(await reason('http://sneaky.example.com/', async () => [{ address: '10.0.0.5', family: 4 }])).toBe('private_address');
  });

  it('rejects when ANY resolved address is private (mixed answers)', async () => {
    const mixed: Resolver = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.0.9', family: 4 }
    ];
    expect(await reason('http://mixed.example.com/', mixed)).toBe('private_address');
  });

  it('rejects an empty DNS answer', async () => {
    expect(await reason('http://nothing.example.com/', async () => [])).toBe('dns_failure');
  });

  it('accepts a public host and returns the validated address to pin', async () => {
    const r = await assertPublicUrl('https://veloceos.cloud/pricing', publicResolver);
    expect(r.address).toBe('93.184.216.34');
    expect(r.family).toBe(4);
    expect(r.url.pathname).toBe('/pricing');
  });

  it('allows explicit ports 80 and 443 only', async () => {
    expect(await reason('http://example.com:80/')).toBe('allowed');
    expect(await reason('https://example.com:443/')).toBe('allowed');
    expect(await reason('https://example.com:8443/')).toBe('bad_port');
  });
});
