import React from 'react';
import { renderToString } from 'react-dom/server';
import { LandingPage, PRODUCT_FAQ } from './LandingPage';
import { PricingPage, PRICING_FAQ } from './PricingPage';
import { PLANS, SITE_URL, usd, perMinute } from './plans';
import type { FaqItem } from './SiteChrome';

/** 'home' is the site root '/'; 'pricing' is '/pricing'. */
export type PageId = 'home' | 'pricing';

export function render(page: PageId): string {
  return renderToString(page === 'home' ? <LandingPage /> : <PricingPage />);
}

const faqPage = (items: FaqItem[]) => ({
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer }
  }))
});

export function structuredData(page: PageId): Record<string, unknown> {
  if (page === 'home') {
    // The static head of index.html already carries Organization, WebSite and SoftwareApplication.
    return { '@context': 'https://schema.org', '@graph': [faqPage(PRODUCT_FAQ)] };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'StratosGTM',
        url: `${SITE_URL}/pricing`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: PLANS.map((plan) => ({
          '@type': 'Offer',
          name: plan.name,
          price: String(plan.priceMonthlyUsd),
          priceCurrency: 'USD',
          description: `${plan.voiceMinutesMonthly.toLocaleString('en-US')} voice minutes per month, then ${perMinute(plan.overageRatePerMinUsd)}; ${usd(plan.priceAnnualMonthlyUsd)}/month billed annually`
        }))
      },
      faqPage(PRICING_FAQ)
    ]
  };
}

/** JSON-LD for the page head. `<` is escaped so no string in the data can close the script tag. */
export function renderHead(page: PageId): string {
  const json = JSON.stringify(structuredData(page)).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
