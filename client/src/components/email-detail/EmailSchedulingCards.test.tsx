/**
 * Unit tests for EmailSchedulingCards — verifies the deterministic card selection,
 * and the `excludeIcsCard` escape hatch that lets the ICS invite card be hoisted
 * above the email (in EmailDetail) without also rendering here (no duplication).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ACTION_TYPE_SCHEDULING_REQUEST } from 'constants/strings';

import { EmailSchedulingCards } from './EmailSchedulingCards';

// Stub the heavy child cards so we assert branch selection, not their internals
// (they fetch over axios / need i18n + auth context).
vi.mock('./IcsInviteCard', () => ({
  IcsInviteCard: () => <div data-testid="ics-invite-card" />,
}));
vi.mock('./SchedulingRequestCard', () => ({
  SchedulingRequestCard: () => <div data-testid="scheduling-request-card" />,
}));
vi.mock('./CalendarInviteActions', () => ({
  CalendarInviteActions: () => <div data-testid="calendar-invite-actions" />,
}));

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    subject: 'Meeting invite',
    from: 'sender@example.com',
    body: 'See attached invite.',
    starCount: 0,
    isRead: false,
    priorityScore: 50,
    date: new Date().toISOString(),
    attachments: [{ attachmentId: 'a1', filename: 'invite.ics', mimeType: 'text/calendar', size: 512 }],
    ...overrides,
  } as Email;
}

const schedulingAction: SuggestedAction = {
  type: ACTION_TYPE_SCHEDULING_REQUEST,
  confidence: 0.9,
  reason: 'Sender proposed a time',
};

describe('EmailSchedulingCards', () => {
  it('renders the IcsInviteCard when an .ics is attached and excludeIcsCard is not set', () => {
    render(<EmailSchedulingCards email={makeEmail()} />);

    expect(screen.getByTestId('ics-invite-card')).toBeInTheDocument();
    expect(screen.queryByTestId('scheduling-request-card')).not.toBeInTheDocument();
  });

  it('skips the IcsInviteCard when excludeIcsCard is true, falling through to the scheduling card', () => {
    render(<EmailSchedulingCards email={makeEmail()} excludeIcsCard schedulingActions={[schedulingAction]} />);

    // The invite card is hoisted above the email elsewhere — it must NOT render here.
    expect(screen.queryByTestId('ics-invite-card')).not.toBeInTheDocument();
    // A scheduling request card still renders when applicable.
    expect(screen.getByTestId('scheduling-request-card')).toBeInTheDocument();
  });

  it('renders nothing when excludeIcsCard is true and there is no other applicable card', () => {
    const { container } = render(<EmailSchedulingCards email={makeEmail()} excludeIcsCard />);

    expect(screen.queryByTestId('ics-invite-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheduling-request-card')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
