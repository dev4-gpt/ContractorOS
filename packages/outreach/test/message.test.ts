import { describe, expect, it } from 'vitest';
import { composeOutreach, MessageError } from '../src/message.js';
import { config, prospect } from './helpers.js';

const url = 'https://bright-electrical-concept.example';
const make = (over: Partial<Parameters<typeof composeOutreach>[0]> = {}) =>
  composeOutreach({ prospect: prospect(), sender: config.sender, offer: config.offer, previewUrl: url, ...over });

describe('composeOutreach', () => {
  const { subject, body } = make();

  it('identifies the sender with a postal address and contact details', () => {
    expect(body).toContain('Sam Example (Example Web Studio)');
    expect(body).toContain('PO Box 1, Springfield');
    expect(body).toContain('sam@example.com');
  });

  it('states the price, the preview link, and that nothing is owed for the concept', () => {
    expect(body).toContain('$25 a month');
    expect(body).toContain(url);
    expect(body).toContain('no obligation');
    expect(subject).toBe('A website concept I made for Bright Electrical');
  });

  it('gives a clear way to opt out and offers takedown', () => {
    expect(body).toContain('reply "no thanks" or email sam@example.com');
    expect(body).toContain('taken down');
  });

  it('never pretends to be a customer or claims to have audited the site', () => {
    expect(body.toLowerCase()).not.toMatch(/quote|looking for|interested in your services|your site is (old|outdated)|i checked|seo|audit/);
  });

  it('uses a separate opt-out address when one is configured', () => {
    const b = make({ sender: { ...config.sender, optOutEmail: 'stop@example.com' } }).body;
    expect(b).toContain('email stop@example.com');
  });

  it('refuses to write without a postal address, a price, or a public https link', () => {
    expect(() => make({ sender: { ...config.sender, postalAddress: ' ' } })).toThrow(MessageError);
    expect(() => make({ offer: { hostingPrice: '' } })).toThrow(/price/);
    expect(() => make({ previewUrl: 'http://x.example' })).toThrow(/https/);
  });

  it('refuses to write while the example placeholders are still in the config', () => {
    expect(() => make({ sender: { ...config.sender, name: 'Your Name' } })).toThrow(/placeholder/);
    expect(() => make({ sender: { ...config.sender, business: 'Your Business (optional)' } })).toThrow(/placeholder/);
  });
});
