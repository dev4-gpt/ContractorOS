import http from 'node:http';
import { AddressInfo } from 'node:net';
import { safeFetch, httpRequestOnce, FetchFailedError, Transport, RawResponse } from '../../buyerlab/safeFetch';
import { UnsafeUrlError, Resolver } from '../../buyerlab/ssrf';

const publicResolver: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (body: string, extra: Partial<RawResponse> = {}): RawResponse => ({
  status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body, truncated: false, ...extra
});
const redirect = (to: string): RawResponse => ({ status: 302, headers: { location: to }, body: '', truncated: false });

describe('safeFetch (guard logic, fake transport)', () => {
  it('returns the body of a normal page and connects to the validated address', async () => {
    const transport = jest.fn<ReturnType<Transport>, Parameters<Transport>>(async () => html('<p>hi</p>'));
    const r = await safeFetch('https://example.com/a', { resolve: publicResolver, transport });
    expect(r.body).toBe('<p>hi</p>');
    expect(transport.mock.calls[0][1]).toBe('93.184.216.34');
  });

  it('follows a redirect to another public page', async () => {
    const seen: string[] = [];
    const transport: Transport = async (url) => {
      seen.push(url.href);
      return url.pathname === '/a' ? redirect('/b') : html('B');
    };
    const r = await safeFetch('https://example.com/a', { resolve: publicResolver, transport });
    expect(seen).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(r.finalUrl).toBe('https://example.com/b');
  });

  it('refuses a redirect into private space (cloud metadata)', async () => {
    const transport: Transport = async () => redirect('http://169.254.169.254/latest/meta-data/');
    await expect(safeFetch('https://example.com/a', { resolve: publicResolver, transport })).rejects.toMatchObject({ reason: 'private_address' });
  });

  it('refuses a redirect to a name that resolves to a private address', async () => {
    const resolve: Resolver = async (h) => (h === 'evil.example.net' ? [{ address: '10.1.1.1', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
    const transport: Transport = async () => redirect('https://evil.example.net/');
    await expect(safeFetch('https://example.com/a', { resolve, transport })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('gives up after too many redirects', async () => {
    const transport: Transport = async (url) => redirect(`/r${url.pathname.length}x`);
    await expect(safeFetch('https://example.com/a', { resolve: publicResolver, transport, maxRedirects: 3 })).rejects.toMatchObject({ reason: 'too_many_redirects' });
  });

  it('refuses non-HTML content on a 200', async () => {
    const transport: Transport = async () => ({ status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF', truncated: false });
    await expect(safeFetch('https://example.com/x.pdf', { resolve: publicResolver, transport })).rejects.toMatchObject({ reason: 'not_html' });
  });

  it('honours a custom accept pattern (robots.txt is text/plain)', async () => {
    const transport: Transport = async () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *', truncated: false });
    const r = await safeFetch('https://example.com/robots.txt', { resolve: publicResolver, transport, accept: /^text\// });
    expect(r.body).toBe('User-agent: *');
  });

  it('returns an error status without a content-type check', async () => {
    const transport: Transport = async () => ({ status: 404, headers: { 'content-type': 'application/json' }, body: '{}', truncated: false });
    const r = await safeFetch('https://example.com/missing', { resolve: publicResolver, transport });
    expect(r.status).toBe(404);
    expect(r.body).toBe('');
  });

  it('passes the truncated flag through', async () => {
    const transport: Transport = async () => html('x'.repeat(10), { truncated: true });
    expect((await safeFetch('https://example.com/', { resolve: publicResolver, transport })).truncated).toBe(true);
  });

  it('never calls the transport for an unsafe start URL', async () => {
    const transport = jest.fn();
    await expect(safeFetch('http://127.0.0.1/', { resolve: publicResolver, transport: transport as any })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects with typed error when redirect Location is not a valid URL', async () => {
    const transport: Transport = async () => redirect('http://[');
    const err = await safeFetch('https://example.com/a', { resolve: publicResolver, transport }).catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeUrlError);
    expect(err.reason).toBe('bad_url');
    expect(err.message).not.toContain('http://[');
  });
});

describe('httpRequestOnce (real transport, local server, below the guard)', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/big') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.write('a'.repeat(5000));
        res.end('b'.repeat(5000));
      } else if (req.url === '/hang') {
        // never answers
      } else {
        res.writeHead(200, { 'content-type': 'text/html', 'x-host': String(req.headers.host), 'x-conn': String(req.headers.connection ?? 'none') });
        res.end('<p>ok</p>');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.closeAllConnections?.();
    server.close();
  });
  const opts = { timeoutMs: 1000, maxBytes: 1000, userAgent: 'test' };

  it('connects to the pinned address, not to whatever the name resolves to', async () => {
    // "pinned.invalid" cannot resolve; success proves the pinned lookup was used.
    const r = await httpRequestOnce(new URL(`http://pinned.invalid:${port}/`), '127.0.0.1', 4, opts);
    expect(r.status).toBe(200);
    expect(r.body).toBe('<p>ok</p>');
    expect(r.headers['x-host']).toBe(`pinned.invalid:${port}`);
  });

  it('caps the body and reports truncation', async () => {
    const r = await httpRequestOnce(new URL(`http://pinned.invalid:${port}/big`), '127.0.0.1', 4, opts);
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(1000);
  });

  it('times out on a server that never answers', async () => {
    await expect(httpRequestOnce(new URL(`http://pinned.invalid:${port}/hang`), '127.0.0.1', 4, { ...opts, timeoutMs: 200 })).rejects.toBeInstanceOf(FetchFailedError);
  });

  it('does not pool sockets (agent: false)', async () => {
    const r = await httpRequestOnce(new URL(`http://pinned.invalid:${port}/`), '127.0.0.1', 4, opts);
    expect(r.headers['x-conn']).toBe('close');
  });
});

describe('safeFetch with deadline (deadlineAt and now)', () => {
  it('honours a hop deadline and throws timeout when time expires before the hop', async () => {
    let t = 100;
    const now = () => t;
    // deadlineAt = 180, so deadline is 80ms from t=100
    // Each guard check is instant, each transport takes 50ms
    // Hop 1: guard (t=100), transport (t=150)
    // Hop 2: guard (t=150), transport (t=200) - but deadline is 180, so should timeout here
    const hopTransport: Transport = async (url, addr, fam, o) => {
      t += 50; // Each hop takes 50ms
      if (url.pathname === '/a') return redirect('/b');
      if (url.pathname === '/b') return redirect('/c');
      if (url.pathname === '/c') return html('end');
      return html('ok');
    };
    await expect(
      safeFetch('https://example.com/a', {
        resolve: publicResolver,
        transport: hopTransport,
        deadlineAt: 180,
        now,
        maxRedirects: 5
      })
    ).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('stops a resolver by deadline using real timers', async () => {
    const startTime = Date.now();
    const deadlineAt = startTime + 80;

    let resolverCalled = false;
    const slowResolver: Resolver = async () => {
      resolverCalled = true;
      // Simulate slow resolution (never actually resolves in 80ms)
      await new Promise((r) => setTimeout(r, 500));
      return [{ address: '93.184.216.34', family: 4 }];
    };

    const transport: Transport = async () => html('ok');

    // Must throw timeout because the resolver won't complete within 80ms
    await expect(
      safeFetch('https://example.com/', {
        resolve: slowResolver,
        transport,
        deadlineAt
      })
    ).rejects.toMatchObject({ reason: 'timeout' });

    expect(resolverCalled).toBe(true);
  });
});
