import { describe, expect, it } from 'vitest';
import { extractFromHtml } from '../src/extract.js';

const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

describe('extractFromHtml', () => {
  it('reads a local business from structured data', () => {
    const html = ld({
      '@context': 'https://schema.org',
      '@type': 'Plumber',
      name: 'Maple Street Plumbing',
      telephone: '+1 555 010 2222',
      email: 'office@maple.example',
      address: { streetAddress: '12 Maple St', addressLocality: 'Springfield', addressRegion: 'ST', postalCode: '00000' }
    });
    const { facts } = extractFromHtml(html);
    expect(facts).toMatchObject({ name: 'Maple Street Plumbing', phone: '+1 555 010 2222', email: 'office@maple.example', street: '12 Maple St', city: 'Springfield', region: 'ST', zip: '00000', industry: 'Plumber' });
  });

  it('finds the business inside an @graph', () => {
    const html = ld({ '@graph': [{ '@type': 'WebSite', name: 'x' }, { '@type': ['LocalBusiness', 'Electrician'], name: 'Bright Electrical' }] });
    const { facts } = extractFromHtml(html);
    expect(facts.name).toBe('Bright Electrical');
    expect(facts.industry).toBe('Electrician');
  });

  it('falls back to og:site_name, then tel: and mailto: links, and says how it found the name', () => {
    const html = `<meta property="og:site_name" content="Oak &amp; Pine Carpentry"><a href="tel:+1-555-010-3333">call</a><a href="mailto:hi@oakpine.example?subject=Hello">mail</a>`;
    const { facts, notes } = extractFromHtml(html);
    expect(facts).toMatchObject({ name: 'Oak & Pine Carpentry', phone: '+1-555-010-3333', email: 'hi@oakpine.example' });
    expect(notes.join(' ')).toMatch(/og:site_name/);
  });

  it('guesses the name from the title only as a last resort, and warns', () => {
    const { facts, notes } = extractFromHtml('<title>Home | Riverside Roofing</title>');
    expect(facts.name).toBe('Riverside Roofing');
    expect(notes.join(' ')).toMatch(/Verify/);
  });

  it('never invents anything when the page has nothing useful', () => {
    expect(extractFromHtml('<html><body><p>Hello</p></body></html>').facts).toEqual({});
  });

  it('ignores malformed structured data and junk phone numbers', () => {
    const html = `<script type="application/ld+json">{oops</script><a href="tel:call-now">x</a><a href="mailto:not-an-email">y</a>`;
    expect(extractFromHtml(html).facts).toEqual({});
  });
});
