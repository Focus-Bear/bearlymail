/**
 * Unit tests for EmailDetailActions — scheduling actions partition (fixes #807).
 *
 * Verifies that:
 * 1. SchedulingRequestCard is shown when schedulingActions contains scheduling types.
 * 2. QuickActionsSection receives only the non-scheduling suggestedActions.
 * 3. When suggestedActions is empty (scheduling types removed upstream),
 *    the Quick Actions button is absent / has count 0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_SCHEDULING_REQUEST,
} from 'constants/strings';

import { EmailDetailActions } from './EmailDetailActions';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@example.com' } }),
}));

jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

jest.mock('utils/calendarUtils', () => ({
  isCalendarInvitation: () => false,
}));

jest.mock('utils/unsubscribeUtils', () => ({
  extractUnsubscribeLink: () => null,
}));

jest.mock('components/email-detail/CalendarInviteActions', () => ({
  CalendarInviteActions: () => <div data-testid="CalendarInviteActions" />,
}));

jest.mock('components/email-detail/SchedulingRequestCard', () => ({
  SchedulingRequestCard: () => <div data-testid="SchedulingRequestCard" />,
}));

jest.mock('components/email-detail/QuickActionsSection', () => ({
  QuickActionsSection: ({ suggestedActions }: { suggestedActions: SuggestedAction[] }) => (
    <div data-testid="QuickActionsSection" data-count={suggestedActions.length} />
  ),
}));

jest.mock('components/email-detail/PriorityButtonRow', () => ({
  PriorityButtonRow: () => <div data-testid="PriorityButtonRow" />,
}));

jest.mock('components/inbox/actions/SnoozeInputForm', () => ({
  SnoozeInputForm: () => <div data-testid="SnoozeInputForm" />,
}));

jest.mock('react-icons/fi', () => ({
  FiArchive: () => null,
  FiClock: () => null,
  FiCornerUpLeft: () => null,
  FiCornerUpRight: () => null,
}));

jest.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    colors: {
      background: { paper: '#fff' },
      border: { light: '#eee' },
      text: { primary: '#000', secondary: '#666' },
      primary: { main: '#0070f3' },
    },
    borderRadius: { md: '8px' },
    typography: { fontSize: { sm: '12px' }, fontWeight: { semibold: '600' } },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseEmail: Email = {
  id: 'email-1',
  subject: 'Test email',
  body: 'Hello',
  from: 'sender@example.com',
  fromName: 'Sender',
  receivedAt: new Date().toISOString(),
} as Email;

const baseProps = {
  email: baseEmail,
  suggestedActions: [] as SuggestedAction[],
  schedulingActions: [] as SuggestedAction[],
  showQuickActionsMenu: false,
  selectedAction: null,
  onShowQuickActionsMenu: jest.fn(),
  onCloseQuickActionsMenu: jest.fn(),
  onSelectAction: jest.fn(),
  onCloseAction: jest.fn(),
  onActionSuccess: jest.fn(),
  onOpenReplyComposer: jest.fn(),
  onArchive: jest.fn(),
  onDelete: jest.fn(),
  onSetStarCount: jest.fn(),
  onBlockSender: jest.fn(),
  onSnooze: jest.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmailDetailActions — scheduling partition (fixes #807)', () => {
  it('renders SchedulingRequestCard when schedulingActions contains scheduling_request', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[{ type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule meeting' } as SuggestedAction]}
      />,
    );
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
  });

  it('renders SchedulingRequestCard when schedulingActions contains calendar_create_invite', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[{ type: ACTION_TYPE_CALENDAR_CREATE_INVITE, label: 'Create invite' } as SuggestedAction]}
      />,
    );
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
  });

  it('does NOT render SchedulingRequestCard when schedulingActions is empty', () => {
    render(<EmailDetailActions {...baseProps} schedulingActions={[]} />);
    expect(screen.queryByTestId('SchedulingRequestCard')).not.toBeInTheDocument();
  });

  it('does NOT render SchedulingRequestCard when schedulingActions is omitted (default)', () => {
    const { suggestedActions: _s, schedulingActions: _sc, ...propsWithoutScheduling } = baseProps;
    render(<EmailDetailActions {...propsWithoutScheduling} suggestedActions={[]} />);
    expect(screen.queryByTestId('SchedulingRequestCard')).not.toBeInTheDocument();
  });

  it('passes 0 actions to QuickActionsSection when suggestedActions is empty (scheduling removed upstream)', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        // upstream partitioned scheduling out — suggestedActions has no scheduling types
        suggestedActions={[]}
        schedulingActions={[{ type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule' } as SuggestedAction]}
      />,
    );
    const section = screen.getByTestId('QuickActionsSection');
    expect(section).toHaveAttribute('data-count', '0');
    // SchedulingRequestCard should be visible
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
  });

  it('passes correct count to QuickActionsSection for non-scheduling actions', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        suggestedActions={[
          { type: 'send_reply', label: 'Reply' } as SuggestedAction,
          { type: 'label_email', label: 'Label' } as SuggestedAction,
        ]}
        schedulingActions={[]}
      />,
    );
    const section = screen.getByTestId('QuickActionsSection');
    expect(section).toHaveAttribute('data-count', '2');
    expect(screen.queryByTestId('SchedulingRequestCard')).not.toBeInTheDocument();
  });

  it('renders both SchedulingRequestCard and QuickActionsSection with non-zero count for mixed actions', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        // upstream already partitioned: scheduling is separate, other actions in suggestedActions
        suggestedActions={[{ type: 'send_reply', label: 'Reply' } as SuggestedAction]}
        schedulingActions={[{ type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule' } as SuggestedAction]}
      />,
    );
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
    const section = screen.getByTestId('QuickActionsSection');
    expect(section).toHaveAttribute('data-count', '1');
  });
});
