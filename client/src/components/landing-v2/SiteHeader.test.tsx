import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from './SiteHeader';

// The mocked t() echoes the key, so assertions target stable i18n keys.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

describe('SiteHeader', () => {
  it('routes the primary CTA to the direct sign-up flow, not a waitlist', () => {
    render(<SiteHeader />);

    const cta = screen.getByText('landing.v2.cta.getStarted');
    expect(cta.tagName).toBe('A');
    expect(cta).toHaveAttribute('href', '/login');

    // The old waitlist CTA must no longer be rendered.
    expect(screen.queryByText('landing.v2.header.joinWaitlist')).not.toBeInTheDocument();
  });
});
