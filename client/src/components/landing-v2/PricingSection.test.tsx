import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { captureEvent } from 'utils/posthog';
import { describe, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { PricingSection } from './PricingSection';

// The mocked t() echoes the key plus any interpolation values, so assertions
// can check both the copy key and the price/allowance passed to it.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

const EXPECTED_TIERS = [
  { id: 'starter', price: 5, emails: 3000 },
  { id: 'growth', price: 15, emails: 10000 },
  { id: 'enterprise', price: 40, emails: 30000 },
];

describe('PricingSection', () => {
  it('renders the pricing anchor the header nav links to', () => {
    const { container } = render(<PricingSection />);

    expect(container.querySelector('section#pricing')).not.toBeNull();
  });

  it.each(EXPECTED_TIERS)('shows the $id tier price and email allowance', ({ id, price, emails }) => {
    render(<PricingSection />);

    const card = screen.getByTestId(`pricing-tier-${id}`);
    expect(within(card).getByText(`landing.v2.pricing.price:${JSON.stringify({ price })}`)).toBeInTheDocument();
    expect(within(card).getByText(`landing.v2.pricing.allowance:${JSON.stringify({ emails })}`)).toBeInTheDocument();
  });

  it('marks only the Growth tier as recommended', () => {
    render(<PricingSection />);

    expect(screen.getAllByText('landing.v2.pricing.recommended')).toHaveLength(1);
    expect(within(screen.getByTestId('pricing-tier-growth')).getByText('landing.v2.pricing.recommended')).toBeVisible();
  });

  it('sends each trial CTA to sign-up and tracks which tier was clicked', () => {
    render(<PricingSection />);

    const ctas = screen.getAllByText('landing.v2.pricing.cta');
    expect(ctas).toHaveLength(EXPECTED_TIERS.length);
    ctas.forEach(cta => expect(cta).toHaveAttribute('href', '/login'));

    fireEvent.click(within(screen.getByTestId('pricing-tier-enterprise')).getByText('landing.v2.pricing.cta'));
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED, {
      source: 'pricing',
      tier: 'enterprise',
    });
  });
});
