import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSite } from '../src/generate.js';
import { readableTextColor, renderSite } from '../src/template.js';
import { config, prospect } from './helpers.js';

describe('renderSite', () => {
  const html = renderSite(prospect(), config.sender);

  it('labels itself a concept and names who made it, with a removal route', () => {
    expect(html).toContain('Concept preview made by Sam Example (Example Web Studio)');
    expect(html).toContain("not Bright Electrical's official website");
    expect(html).toContain('mailto:sam@example.com');
  });

  it('tells search engines not to index it', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('uses only the supplied facts', () => {
    expect(html).toContain('Rewiring');
    expect(html).toContain('tel:+15550101111');
    expect(html.toLowerCase()).not.toMatch(/\b(reviews?|ratings?|stars?|awards?|certified|guarantee[ds]?|years of experience|testimonials?)\b/);
  });

  it('leaves out sections that have no supplied facts', () => {
    const bare = renderSite(
      prospect({ services: undefined, phone: undefined, email: undefined, city: undefined, region: undefined, industry: undefined }),
      config.sender
    );
    expect(bare).not.toContain('id="services"');
    expect(bare).not.toContain('id="contact"');
  });

  it('escapes hostile text everywhere it is used', () => {
    const evil = renderSite(prospect({ name: '<script>alert(1)</script>', services: ['"><img src=x onerror=alert(1)>'] }), config.sender);
    expect(evil).not.toContain('<script>alert(1)');
    expect(evil).not.toContain('<img src=x');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('has no scripts and makes no external requests', () => {
    expect(html).not.toMatch(/<script|src=|<link[^>]+href="http/i);
  });

  it('picks readable text on light and dark accents', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#101010')).toBe('#ffffff');
  });
});

describe('generateSite', () => {
  it('writes the page, robots.txt, a noindex header and a provenance manifest', () => {
    const out = mkdtempSync(join(tmpdir(), 'pp-'));
    const p = prospect();
    const site = generateSite(p, config.sender, out);
    for (const f of ['index.html', 'robots.txt', 'vercel.json', 'manifest.json']) expect(existsSync(join(site.dir, f))).toBe(true);
    expect(readFileSync(join(site.dir, 'robots.txt'), 'utf8')).toContain('Disallow: /');
    expect(readFileSync(join(site.dir, 'vercel.json'), 'utf8')).toContain('X-Robots-Tag');
    const manifest = JSON.parse(readFileSync(join(site.dir, 'manifest.json'), 'utf8'));
    expect(manifest.sourceOfDetails).toBe(p.sourceOfDetails);
    expect(manifest.factsUsed).toContain('services');
  });
});
