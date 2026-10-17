import { describe, expect, it } from 'vitest';
import { parseRobots } from '../src/robots.js';
import { isPrivateAddress, assertPublicHost, UnsafeHostError } from '../src/netguard.js';

describe('parseRobots', () => {
  it('allows everything when there are no rules for us', () => {
    expect(parseRobots('', 'prospect-previews').allows('/anything')).toBe(true);
  });

  it('honors Disallow for everyone', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private\n', 'prospect-previews');
    expect(r.allows('/private/x')).toBe(false);
    expect(r.allows('/contact')).toBe(true);
  });

  it('treats "Disallow: /" as a full stop', () => {
    expect(parseRobots('User-agent: *\nDisallow: /\n', 'prospect-previews').allows('/')).toBe(false);
  });

  it('prefers the group that names us over the wildcard group', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: prospect-previews\nAllow: /\n';
    expect(parseRobots(txt, 'prospect-previews').allows('/contact')).toBe(true);
    const blocked = 'User-agent: *\nAllow: /\n\nUser-agent: prospect-previews\nDisallow: /\n';
    expect(parseRobots(blocked, 'prospect-previews').allows('/')).toBe(false);
  });

  it('lets the longest matching rule win, and Allow win a tie', () => {
    const r = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/public\n', 'prospect-previews');
    expect(r.allows('/a/secret')).toBe(false);
    expect(r.allows('/a/public/page')).toBe(true);
  });

  it('supports wildcards and end anchors', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\n', 'prospect-previews');
    expect(r.allows('/files/x.pdf')).toBe(false);
    expect(r.allows('/files/x.pdf.html')).toBe(true);
  });

  it('reads a crawl delay and ignores comments', () => {
    const r = parseRobots('# hi\nUser-agent: * # everyone\nCrawl-delay: 5\nDisallow: /x # nope\n', 'prospect-previews');
    expect(r.crawlDelay).toBe(5);
    expect(r.allows('/x')).toBe(false);
  });
});

describe('netguard', () => {
  it('flags private, loopback and link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('refuses hosts that resolve to non-public addresses', async () => {
    await expect(assertPublicHost('evil.example', async () => [{ address: '10.0.0.7' }])).rejects.toThrow(UnsafeHostError);
    await expect(assertPublicHost('localhost')).rejects.toThrow(UnsafeHostError);
    await expect(assertPublicHost('ok.example', async () => [{ address: '93.184.216.34' }])).resolves.toBeUndefined();
  });
});
