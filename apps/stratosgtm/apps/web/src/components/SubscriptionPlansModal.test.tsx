import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionPlansModal } from './SubscriptionPlansModal';
import { PLANS } from '../pages/plans';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SubscriptionPlansModal highlightPlanId', () => {
  it('marks only the requested plan card as highlighted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(url.includes('/api/billing/plans') ? { plans: PLANS } : { result: null })
        })
      )
    );

    render(<SubscriptionPlansModal isOpen onClose={() => {}} clientId="Acme" highlightPlanId="enterprise" />);

    const enterprise = await screen.findByText('Enterprise');
    expect(enterprise.closest('[data-highlighted="true"]')).not.toBeNull();
    expect(screen.getByText('Starter').closest('[data-highlighted="true"]')).toBeNull();
  });
});
