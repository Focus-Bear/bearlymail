import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { OpenTrackingSummary } from 'types/email';

import { OpenTrackingIndicator } from './OpenTrackingIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
}));

const sent: OpenTrackingSummary = {
  sentAt: '2026-10-10T09:00:00.000Z',
  recipientCount: 1,
  openCount: 0,
  firstOpenedAt: null,
  lastOpenedAt: null,
  automaticOpenCount: 0,
  lastAutomaticOpenAt: null,
};

const opened: OpenTrackingSummary = {
  ...sent,
  openCount: 3,
  firstOpenedAt: '2026-10-10T10:00:00.000Z',
  lastOpenedAt: '2026-10-11T10:00:00.000Z',
  recentOpens: [
    { openedAt: '2026-10-11T10:00:00.000Z', openSource: 'gmail_proxy', isLikelyAutomatic: false },
    { openedAt: '2026-10-10T10:00:00.000Z', openSource: 'direct', isLikelyAutomatic: false },
  ],
};

describe('OpenTrackingIndicator', () => {
  it('shows a single check "Sent" before any open', () => {
    render(<OpenTrackingIndicator summary={sent} />);
    const indicator = screen.getByTestId('open-tracking-indicator');
    expect(indicator).toHaveAttribute('data-state', 'sent');
    expect(indicator).toHaveTextContent('✓openTracking.sent');
  });

  it('shows the double check with the open count once opened', () => {
    render(<OpenTrackingIndicator summary={opened} />);
    const indicator = screen.getByTestId('open-tracking-indicator');
    expect(indicator).toHaveAttribute('data-state', 'opened');
    expect(indicator).toHaveTextContent('✓✓');
    expect(indicator).toHaveTextContent('openTracking.opened');
    expect(indicator).toHaveTextContent('"count":3');
  });

  it('flags Apple Mail Privacy Protection-only opens as possibly automatic', () => {
    render(<OpenTrackingIndicator summary={{ ...sent, automaticOpenCount: 1 }} />);
    const indicator = screen.getByTestId('open-tracking-indicator');
    expect(indicator).toHaveAttribute('data-state', 'maybe_automatic');
    expect(indicator).toHaveTextContent('openTracking.maybeAutomatic');
  });

  it('reveals the open history on focus, listing each open', () => {
    render(<OpenTrackingIndicator summary={opened} />);
    fireEvent.focus(screen.getByTestId('open-tracking-indicator'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('openTracking.historyTitle');
    expect(tooltip.querySelectorAll('li')).toHaveLength(2);
    expect(tooltip).toHaveTextContent('openTracking.sourceGmail');
  });

  it('does not bubble clicks to the clickable header it sits in', () => {
    const onHeaderClick = vi.fn();
    render(
      <div onClick={onHeaderClick}>
        <OpenTrackingIndicator summary={opened} />
      </div>
    );
    fireEvent.click(screen.getByTestId('open-tracking-indicator'));
    expect(onHeaderClick).not.toHaveBeenCalled();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
