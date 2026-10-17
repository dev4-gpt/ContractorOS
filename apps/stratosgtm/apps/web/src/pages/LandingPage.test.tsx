import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LandingPage, PRODUCT_FAQ, CONSENT_STATES, LANDING_H1 } from './LandingPage';

describe('LandingPage', () => {
  const html = renderToString(<LandingPage />);

  it('has the landing H1', () => {
    expect(html).toMatch(new RegExp(`<h1[^>]*>${LANDING_H1}</h1>`));
  });

  it('lists all 13 all-party-consent states', () => {
    expect(CONSENT_STATES).toHaveLength(13);
    for (const code of CONSENT_STATES) {
      expect(html).toContain(`>${code}<`);
    }
  });

  it('renders each FAQ question', () => {
    expect(PRODUCT_FAQ).toHaveLength(5);
    for (const item of PRODUCT_FAQ) {
      expect(html).toContain(item.question);
    }
  });

  it('links to the console demo and pricing', () => {
    expect(html).toContain('href="/console"');
    expect(html).toContain('href="/pricing"');
  });
});
