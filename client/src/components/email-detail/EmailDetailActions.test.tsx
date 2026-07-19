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
import { isCalendarInvitation } from 'utils/calendarUtils';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ACTION_TYPE_CALENDAR_CREATE_INVITE, ACTION_TYPE_SCHEDULING_REQUEST } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

import { EmailDetailActions } from './EmailDetailActions';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@example.com' } }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('utils/calendarUtils', () => ({
  isCalendarInvitation: vi.fn(() => false),
}));

vi.mock('utils/unsubscribeUtils', () => ({
  extractUnsubscribeLink: () => null,
}));

vi.mock('components/email-detail/CalendarInviteActions', () => ({
  CalendarInviteActions: () => <div data-testid="CalendarInviteActions" />,
}));

vi.mock('components/email-detail/SchedulingRequestCard', () => ({
  SchedulingRequestCard: () => <div data-testid="SchedulingRequestCard" />,
}));

vi.mock('components/email-detail/QuickActionsSection', () => ({
  QuickActionsSection: ({ suggestedActions }: { suggestedActions: SuggestedAction[] }) => (
    <div data-testid="QuickActionsSection" data-count={suggestedActions.length} />
  ),
}));

vi.mock('components/priority/PriorityChip', () => ({
  PriorityChip: () => <div data-testid="PriorityChip" />,
}));

vi.mock('components/inbox/actions/SnoozeInputForm', () => ({
  SnoozeInputForm: () => <div data-testid="SnoozeInputForm" />,
}));

vi.mock('components/email-detail/PrintableThread', () => ({
  PrintableThread: () => <div data-testid="PrintableThread" />,
}));

vi.mock('react-icons/fi', () => ({
  FiArchive: () => null,
  FiClock: () => null,
  FiCornerUpLeft: () => null,
  FiCornerUpRight: () => null,
  FiPrinter: () => null,
}));

vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: vi.fn(() => ({ isMobile: false, isTablet: false, isDesktop: true })),
}));

const mockUseResponsiveBreakpoints = vi.mocked(useResponsiveBreakpoints);

vi.mock('components/common/OverflowMenu', () => ({
  OverflowMenu: () => <div data-testid="OverflowMenu" />,
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    colors: {
      background: { paper: '#fff' },
      border: { light: '#eee', medium: '#ccc' },
      text: { primary: '#000', secondary: '#666' },
      primary: { main: '#0070f3', light: '#e0f0ff' },
    },
    borderRadius: { md: '8px' },
    typography: { fontSize: { sm: '12px', xl: '20px' }, fontWeight: { semibold: '600', medium: '500', bold: '700' } },
  },
}));

vi.mock('constants/layout', () => ({
  TOUCH_TARGET_MIN_PX: 44,
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
  onShowQuickActionsMenu: vi.fn(),
  onCloseQuickActionsMenu: vi.fn(),
  onSelectAction: vi.fn(),
  onCloseAction: vi.fn(),
  onActionSuccess: vi.fn(),
  onOpenReplyComposer: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  onSetStarCount: vi.fn(),
  onBlockSender: vi.fn(),
  onSnooze: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseResponsiveBreakpoints.mockReturnValue({ isMobile: false, isTablet: false, isDesktop: true });
  // Reset the isCalendarInvitation mock to its default (false) before each test
  vi.mocked(isCalendarInvitation).mockReset();
  vi.mocked(isCalendarInvitation).mockImplementation(() => false);
});

describe('EmailDetailActions — scheduling partition (fixes #807)', () => {
  it('shows SchedulingRequestCard (not CalendarInviteActions) when email looks like a calendar invitation but has a detected meeting proposal (fixes #1780)', () => {
    // Simulate the bug: subject contains "Calendar Invitation" keywords (isCalendarInvitation returns
    // true) but the AI also detected a meeting proposal (schedulingActions is non-empty).
    // SchedulingRequestCard must win — the user needs "Create Calendar Invite", not Accept/Decline.
    vi.mocked(isCalendarInvitation).mockReturnValueOnce(true);

    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[
          { type: ACTION_TYPE_CALENDAR_CREATE_INVITE, label: 'Create invite' } as unknown as SuggestedAction,
        ]}
        onRespondToInvitation={vi.fn()}
      />
    );

    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
    expect(screen.queryByTestId('CalendarInviteActions')).not.toBeInTheDocument();
  });

  it('shows CalendarInviteActions when email is a calendar invitation with no detected meeting proposal', () => {
    vi.mocked(isCalendarInvitation).mockReturnValueOnce(true);

    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[]}
        loadingSchedulingActions={false}
        onRespondToInvitation={vi.fn()}
      />
    );

    expect(screen.getByTestId('CalendarInviteActions')).toBeInTheDocument();
    expect(screen.queryByTestId('SchedulingRequestCard')).not.toBeInTheDocument();
  });

  it('does NOT show CalendarInviteActions while scheduling actions are loading (#1788)', () => {
    vi.mocked(isCalendarInvitation).mockReturnValueOnce(true);

    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[]}
        loadingSchedulingActions
        onRespondToInvitation={vi.fn()}
      />
    );

    expect(screen.queryByTestId('CalendarInviteActions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('SchedulingRequestCard')).not.toBeInTheDocument();
  });

  it('renders SchedulingRequestCard when schedulingActions contains scheduling_request', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[
          { type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule meeting' } as unknown as SuggestedAction,
        ]}
      />
    );
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
  });

  it('renders SchedulingRequestCard when schedulingActions contains calendar_create_invite', () => {
    render(
      <EmailDetailActions
        {...baseProps}
        schedulingActions={[
          { type: ACTION_TYPE_CALENDAR_CREATE_INVITE, label: 'Create invite' } as unknown as SuggestedAction,
        ]}
      />
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
        schedulingActions={[{ type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule' } as unknown as SuggestedAction]}
      />
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
          { type: 'send_reply', label: 'Reply' } as unknown as SuggestedAction,
          { type: 'label_email', label: 'Label' } as unknown as SuggestedAction,
        ]}
        schedulingActions={[]}
      />
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
        suggestedActions={[{ type: 'send_reply', label: 'Reply' } as unknown as SuggestedAction]}
        schedulingActions={[{ type: ACTION_TYPE_SCHEDULING_REQUEST, label: 'Schedule' } as unknown as SuggestedAction]}
      />
    );
    expect(screen.getByTestId('SchedulingRequestCard')).toBeInTheDocument();
    const section = screen.getByTestId('QuickActionsSection');
    expect(section).toHaveAttribute('data-count', '1');
  });
});

describe('EmailDetailActions — mobile layout (fixes #1068)', () => {
  beforeEach(() => {
    mockUseResponsiveBreakpoints.mockReturnValue({ isMobile: true, isTablet: false, isDesktop: false });
  });

  afterEach(() => {
    mockUseResponsiveBreakpoints.mockReturnValue({ isMobile: false, isTablet: false, isDesktop: true });
  });

  it('renders the two-row mobile layout with Reply All, Forward, Archive, and Snooze buttons', () => {
    render(<EmailDetailActions {...baseProps} />);

    // Both rows should be present — verify key action labels
    expect(screen.getByText('emailDetail.replyAll')).toBeInTheDocument();
    expect(screen.getByText('emailDetail.forward')).toBeInTheDocument();
    expect(screen.getByText('emailDetail.archive')).toBeInTheDocument();
    expect(screen.getByText('emailDetail.snooze')).toBeInTheDocument();
  });

  it('renders OverflowMenu in the first row on mobile', () => {
    render(<EmailDetailActions {...baseProps} />);
    expect(screen.getByTestId('OverflowMenu')).toBeInTheDocument();
  });

  it('renders the block sender button in row 2 when there is no unsubscribe link', () => {
    render(<EmailDetailActions {...baseProps} />);
    expect(screen.getByText('inbox.blockSender')).toBeInTheDocument();
  });
});
