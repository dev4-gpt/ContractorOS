import { describe, expect, it, vi } from 'vitest';
import { FetchError, RobotsDisallowedError, fetchPublicDetails, USER_AGENT } from '../src/fetchDetails.js';
import { UnsafeHostError } from '../src/netguard.js';

const publicDns = async () => [{ address: '93.184.216.34' }];

const HOME = `<title>Home | Maple Street Plumbing</title>
<script type="application/ld+json">{"@type":"Plumber","name":"Maple Street Plumbing","telephone":"+1 555 010 2222"}</script>
<a href="/contact-us">Contact</a><a href="/about">About</a>`;
const CONTACT = `<a href="mailto:office@maple.example">email</a>`;

function site(pages: Record<string, { status?: number; type?: string; body?: string; location?: string }>) {
  const calls: { url: string; ua: string | null }[] = [];
  const fetchImpl = vi.fn(async (input: any, init?: any) => {
    const url = new URL(String(input));
    calls.push({ url: url.pathname, ua: new Headers(init?.headers).get('user-agent') });
    const p = pages[url.pathname] ?? { status: 404, body: '' };
    const headers: Record<string, string> = { 'content-type': p.type ?? 'text/html' };
    if (p.location) headers.location = p.location;
    return new Response(p.body ?? '', { status: p.status ?? 200, headers });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}
const run = (s: ReturnType<typeof site>, extra = {}) =>
  fetchPublicDetails('https://maple.example', { fetchImpl: s.fetchImpl, lookup: publicDns, sleep: async () => {}, ...extra });

describe('fetchPublicDetails', () => {
  it('reads the home and contact pages and returns a reviewable draft with sources', async () => {
    const s = site({ '/': { body: HOME }, '/contact-us': { body: CONTACT }, '/about': { body: '<p>hi</p>' } });
    const { draft, pagesUsed, notes } = await run(s);
    expect(draft).toMatchObject({ name: 'Maple Street Plumbing', phone: '+1 555 010 2222', email: 'office@maple.example', website: 'https://maple.example' });
    expect(String(draft.sourceOfDetails)).toContain('https://maple.example/contact-us');
    expect(pagesUsed).toContain('https://maple.example/');
    expect(notes.join(' ')).toMatch(/Review and correct/);
  });

  it('identifies itself with a descriptive User-Agent', async () => {
    const s = site({ '/': { body: HOME } });
    await run(s);
    expect(s.calls.every((c) => c.ua === USER_AGENT)).toBe(true);
    expect(USER_AGENT).toContain('prospect-previews');
  });

  it('fetches robots.txt first and stops if the whole site is disallowed', async () => {
    const s = site({ '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /\n' }, '/': { body: HOME } });
    await expect(run(s)).rejects.toThrow(RobotsDisallowedError);
    expect(s.calls.map((c) => c.url)).toEqual(['/robots.txt']);
  });

  it('skips a page robots.txt disallows but still uses the others', async () => {
    const s = site({
      '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /contact-us\n' },
      '/': { body: HOME },
      '/about': { body: '<a href="mailto:about@maple.example">x</a>' }
    });
    const { draft, notes } = await run(s);
    expect(s.calls.some((c) => c.url === '/contact-us')).toBe(false);
    expect(notes.join(' ')).toMatch(/disallows \/contact-us/);
    expect(draft.email).toBe('about@maple.example');
  });

  it('treats an unreadable robots.txt as "do not crawl"', async () => {
    const s = site({ '/robots.txt': { status: 500, body: 'oops' }, '/': { body: HOME } });
    await expect(run(s)).rejects.toThrow(RobotsDisallowedError);
  });

  it('waits between pages, longer if the site asks for a crawl delay', async () => {
    const sleep = vi.fn(async () => {});
    const s = site({ '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nCrawl-delay: 4\n' }, '/': { body: HOME }, '/contact-us': { body: CONTACT }, '/about': { body: '' } });
    await run(s, { sleep });
    expect(sleep).toHaveBeenCalled();
    expect(sleep.mock.calls.every((c) => (c as unknown as number[])[0] === 4000)).toBe(true);
  });

  it('never fetches more than the page cap', async () => {
    const s = site({ '/': { body: HOME }, '/contact-us': { body: CONTACT }, '/about': { body: '' } });
    await run(s, { maxPages: 2 });
    expect(s.calls.filter((c) => c.url !== '/robots.txt').length).toBe(2);
  });

  it('refuses to follow a redirect to another site', async () => {
    const s = site({ '/robots.txt': { status: 404 }, '/': { status: 301, location: 'https://elsewhere.example/' } });
    const out = await run(s);
    expect(out.pagesUsed).toEqual([]);
    expect(out.notes.join(' ')).toMatch(/different site/);
  });

  it('follows a same-site redirect, including www', async () => {
    const s = site({ '/robots.txt': { status: 404 }, '/': { status: 301, location: '/home' }, '/home': { body: HOME } });
    const out = await run(s);
    expect(out.draft.name).toBe('Maple Street Plumbing');
  });

  it('refuses a host that resolves to a private address, and says so', async () => {
    const s = site({ '/': { body: HOME } });
    const attempt = fetchPublicDetails('https://maple.example', { fetchImpl: s.fetchImpl, lookup: async () => [{ address: '10.0.0.5' }], sleep: async () => {} });
    await expect(attempt).rejects.toThrow(UnsafeHostError);
    expect(s.calls.length).toBe(0);
  });

  it('refuses localhost and raw private IPs without any network call', async () => {
    const s = site({ '/': { body: HOME } });
    await expect(fetchPublicDetails('http://localhost', { fetchImpl: s.fetchImpl })).rejects.toThrow(UnsafeHostError);
    await expect(fetchPublicDetails('http://169.254.169.254/latest/meta-data', { fetchImpl: s.fetchImpl })).rejects.toThrow(UnsafeHostError);
    expect(s.calls.length).toBe(0);
  });

  it('rejects odd ports, non-http schemes and nonsense input', async () => {
    const s = site({});
    await expect(fetchPublicDetails('https://maple.example:8080', { fetchImpl: s.fetchImpl, lookup: publicDns })).rejects.toThrow(FetchError);
    await expect(fetchPublicDetails('ftp://maple.example', { fetchImpl: s.fetchImpl, lookup: publicDns })).rejects.toThrow(/http/);
    await expect(fetchPublicDetails('http://', { fetchImpl: s.fetchImpl, lookup: publicDns })).rejects.toThrow(FetchError);
  });

  it('ignores non-HTML responses and caps how much it reads', async () => {
    const s = site({ '/robots.txt': { status: 404 }, '/': { type: 'application/pdf', body: HOME } });
    const out = await run(s);
    expect(out.pagesUsed).toEqual([]);
    const big = site({ '/robots.txt': { status: 404 }, '/': { body: 'x'.repeat(5000) + HOME } });
    const capped = await run(big, { maxBytes: 100 });
    expect(capped.draft.name).toBeUndefined();
  });

  it('flags a draft that is missing what the tool needs', async () => {
    const s = site({ '/robots.txt': { status: 404 }, '/': { body: '<p>nothing</p>' } });
    const { notes } = await run(s);
    expect(notes.join(' ')).toMatch(/Could not find the business name/);
  });
});
