import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PricingPage, PRICING_FAQ } from './PricingPage';
import { PLANS, usd, perMinute } from './plans';

describe('PricingPage', () => {
  const html = renderToString(<PricingPage />);

  it('has a Pricing heading', () => {
    expect(html).toMatch(/<h1[^>]*>Pricing<\/h1>/);
  });

  it.each(PLANS.map((p) => [p.id, p]))('shows every catalog figure for %s', (_id, plan) => {
    expect(html).toContain(plan.name);
    expect(html).toContain(usd(plan.priceMonthlyUsd));
    expect(html).toContain(usd(plan.priceAnnualMonthlyUsd));
    expect(html).toContain(perMinute(plan.overageRatePerMinUsd));
    expect(html).toContain(`href="/console?plan=${plan.id}"`);
  });

  it('renders each pricing FAQ question', () => {
    for (const item of PRICING_FAQ) {
      expect(html).toContain(item.question);
    }
  });
});
