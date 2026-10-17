import { describe, it, expect } from 'vitest';
import { render, renderHead } from './entry-server';
import { PLANS } from './plans';
import { PRODUCT_FAQ, LANDING_H1 } from './LandingPage';

const parseHead = (head: string) =>
  JSON.parse(head.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, ''));

describe('prerender entry', () => {
  it('renders the marketing homepage', () => {
    expect(render('home')).toContain(LANDING_H1);
  });

  it('renders the pricing page', () => {
    expect(render('pricing')).toMatch(/<h1[^>]*>Pricing<\/h1>/);
  });

  it('emits one Offer per plan at the catalog monthly price', () => {
    const graph = parseHead(renderHead('pricing'))['@graph'] as Array<Record<string, any>>;
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication')!;
    expect(app.offers.map((o: { price: string }) => o.price)).toEqual(PLANS.map((p) => String(p.priceMonthlyUsd)));
  });

  it('emits FAQPage JSON-LD on the homepage matching its visible FAQ', () => {
    const graph = parseHead(renderHead('home'))['@graph'] as Array<Record<string, any>>;
    const faq = graph.find((n) => n['@type'] === 'FAQPage')!;
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(PRODUCT_FAQ.map((f) => f.question));
  });

  it('escapes < so content cannot close the script tag', () => {
    for (const page of ['home', 'pricing'] as const) {
      expect(renderHead(page)).not.toMatch(/<(?!\/?script)/);
    }
  });
});
