/**
 * Unit tests for SchedulingRequestCard — loading behaviour, review-first flow,
 * and correct event link handling (fixes #1788).
 *
 * Verifies that:
 * 1. A loading message is shown while the proposal API call is in-flight (not
 *    the Copy Link / Draft Reply buttons that previously flashed).
 * 2. When a proposal is detected the edit form is shown immediately so the user
 *    can review details before creating the event.
 * 3. After creation the Google Calendar htmlLink is used for "View in Google
 *    Calendar", not the Google Meet meetLink.
 * 4. A separate "Join Google Meet" link is shown when a meetLink is returned.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { Email } from 'types/email';

import { SchedulingRequestCard } from './SchedulingRequestCard';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'minutes' in opts) {
        return `${opts.minutes} minutes`;
      }
      return key;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    colors: {
      background: { default: '#f9f9f9', paper: '#fff' },
      border: { light: '#eee', medium: '#ccc' },
      text: { primary: '#000', secondary: '#666', tertiary: '#999' },
      primary: { main: '#0070f3' },
      accent: { success: '#00a854', error: '#ff4d4f' },
    },
    borderRadius: { sm: '4px', md: '8px' },
    typography: {
      fontSize: { sm: '12px', base: '14px', lg: '16px' },
      fontWeight: { semibold: '600' },
      lineHeight: { normal: '1.5' },
    },
  },
}));

vi.mock('constants/numbers', () => ({
  SCHEDULING_GAP_15_MIN: 15,
  SCHEDULING_GAP_30_MIN: 30,
  SCHEDULING_GAP_45_MIN: 45,
  SCHEDULING_GAP_60_MIN: 60,
  SCHEDULING_GAP_90_MIN: 90,
  SHORT_TIMEOUT_MS: 2000,
}));

vi.mock('constants/strings', () => ({
  STRING_NONE: 'none',
  STRING_TRANSPARENT: 'transparent',
}));

vi.mock('constants/colors', () => ({
  COLOR_NAMED_WHITE: '#ffffff',
}));

vi.mock('constants/emojis', () => ({
  EMOJI_CALENDAR: '📅',
}));

vi.mock('constants/analytics-events', () => ({
  ANALYTICS_EVENTS: {
    SCHEDULING_LINK_COPIED: 'scheduling_link_copied',
    SCHEDULING_DRAFT_REPLY_CLICKED: 'scheduling_draft_reply_clicked',
  },
}));

vi.mock('config/api', () => ({
  API_URL: 'http://localhost:3001',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    subject: 'Can we meet May 19 at 6:15pm Eastern?',
    from: 'sender@example.com',
    fromName: 'Alice',
    body: 'Does May 19 at 6:15pm Eastern work for you?',
    starCount: 1,
    isRead: false,
    category: 'Work',
    priorityScore: 60,
    date: new Date().toISOString(),
    ...overrides,
  } as Email;
}

const noProposalResponse = {
  hasProposal: false,
  proposedTime: null,
  proposedTimeText: null,
  topic: null,
  durationMinutes: null,
  isAvailable: null,
  calendarConnected: false,
};

const withProposalResponse = {
  hasProposal: true,
  proposedTime: '2026-05-19T22:15:00Z',
  windowEnd: null,
  proposedTimeText: 'May 19 at 6:15pm Eastern',
  topic: 'Meeting',
  durationMinutes: 30,
  isAvailable: true,
  suggestedTime: '2026-05-19T22:15:00Z',
  calendarConnected: true,
};

/** Sender proposed a window ("between 1 and 4"); a free slot was found inside it. */
const windowWithFreeSlotResponse = {
  hasProposal: true,
  proposedTime: '2026-07-08T03:00:00Z',
  windowEnd: '2026-07-08T06:00:00Z',
  proposedTimeText: 'Wednesday 8th July between 1 and 4',
  topic: 'Seminar Series',
  durationMinutes: null,
  isAvailable: true,
  suggestedTime: '2026-07-08T04:00:00Z',
  calendarConnected: true,
};

/** Sender proposed a window but every slot inside it is booked. */
const windowFullyBookedResponse = {
  ...windowWithFreeSlotResponse,
  isAvailable: false,
  suggestedTime: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (axios.isAxiosError as unknown as jest.Mock) = vi.fn(() => false);
});

describe('SchedulingRequestCard — loading behaviour (#1788)', () => {
  it('shows a loading message while the proposal API call is in-flight', () => {
    // Never resolves during this test
    mockedAxios.post.mockReturnValue(new Promise(() => {}));

    render(<SchedulingRequestCard email={makeEmail()} />);

    expect(
      screen.getByText('emailDetail.schedulingRequest.checkingProposal')
    ).toBeInTheDocument();

    // The Copy Link / Draft Reply buttons must NOT flash during loading
    expect(
      screen.queryByText('emailDetail.schedulingRequest.copyLink')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('emailDetail.schedulingRequest.draftReply')
    ).not.toBeInTheDocument();
  });

  it('shows scheduling action buttons after loading when no proposal found', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: noProposalResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(
        screen.getByText('emailDetail.schedulingRequest.copyLink')
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText('emailDetail.schedulingRequest.checkingProposal')
    ).not.toBeInTheDocument();
  });
});

describe('SchedulingRequestCard — review-first flow (#1788 fix #3)', () => {
  it('shows the edit form immediately when a proposal is detected', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: withProposalResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(
        screen.queryByText('emailDetail.schedulingRequest.checkingProposal')
      ).not.toBeInTheDocument();
    });

    // Edit form should be visible immediately — not the "Create Calendar Invite" button
    expect(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.editTitle')
    ).toBeInTheDocument();

    // The raw "Create Calendar Invite" one-click button must NOT be shown
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.createInvite')
    ).not.toBeInTheDocument();

    // Confirm & Create button should be present in the form
    expect(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm')
    ).toBeInTheDocument();
  });

  it('does NOT auto-create when proposal is loaded — only confirms after user clicks Confirm', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: withProposalResponse }) // check-proposed-time
      .mockResolvedValueOnce({
        data: { meetLink: 'https://meet.google.com/abc', eventId: 'evt-1', htmlLink: 'https://calendar.google.com/event?eid=abc' },
      }); // create-from-email-proposal

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm')).toBeInTheDocument();
    });

    // Only one POST should have been made so far (check-proposed-time)
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/calendar/check-proposed-time/'),
    );
  });
});

describe('SchedulingRequestCard — proposed time windows', () => {
  it('surfaces the free slot found inside a proposed window', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: windowWithFreeSlotResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    // Leave the review form to reveal the availability line.
    await waitFor(() => {
      expect(
        screen.getByText('emailDetail.schedulingRequest.proposedTime.cancel')
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.cancel')
    );

    // A window with a free slot shows "free at …", never the blunt conflict warning.
    expect(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.freeAt')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.conflict')
    ).not.toBeInTheDocument();
  });

  it('shows the busy-window message when no slot is free in the proposed window', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: windowFullyBookedResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(
        screen.getByText('emailDetail.schedulingRequest.proposedTime.cancel')
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.cancel')
    );

    expect(
      screen.getByText('emailDetail.schedulingRequest.proposedTime.busyWindow')
    ).toBeInTheDocument();
    // The single-time "conflict" copy must not be used for a window.
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.conflict')
    ).not.toBeInTheDocument();
  });
});

describe('SchedulingRequestCard — correct event link after creation (#1788 fix #4)', () => {
  it('shows View in Google Calendar using htmlLink after creation', async () => {
    const htmlLink = 'https://calendar.google.com/event?eid=event123';
    const meetLink = 'https://meet.google.com/abc-xyz';

    mockedAxios.post
      .mockResolvedValueOnce({ data: withProposalResponse }) // check-proposed-time
      .mockResolvedValueOnce({
        data: { meetLink, eventId: 'evt-1', htmlLink },
      }); // create-from-email-proposal

    render(<SchedulingRequestCard email={makeEmail()} />);

    // Wait for proposal to load and edit form to appear
    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm')).toBeInTheDocument();
    });

    // Click Confirm & Create
    await userEvent.click(screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm'));

    // Wait for creation to complete
    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.viewEvent')).toBeInTheDocument();
    });

    // "View in Google Calendar" link should use htmlLink, not meetLink
    const viewLink = screen.getByText('emailDetail.schedulingRequest.proposedTime.viewEvent').closest('a');
    expect(viewLink).toHaveAttribute('href', htmlLink);

    // "Join Google Meet" link should be shown separately
    const meetLinkEl = screen.getByText('emailDetail.schedulingRequest.proposedTime.joinMeeting').closest('a');
    expect(meetLinkEl).toHaveAttribute('href', meetLink);
  });

  it('shows only View in Google Calendar when there is no meetLink', async () => {
    const htmlLink = 'https://calendar.google.com/event?eid=event123';

    mockedAxios.post
      .mockResolvedValueOnce({ data: withProposalResponse })
      .mockResolvedValueOnce({
        data: { meetLink: null, eventId: 'evt-1', htmlLink },
      });

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('emailDetail.schedulingRequest.proposedTime.confirm'));

    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.viewEvent')).toBeInTheDocument();
    });

    expect(screen.queryByText('emailDetail.schedulingRequest.proposedTime.joinMeeting')).not.toBeInTheDocument();
  });
});

describe('SchedulingRequestCard — already-scheduled proposal (#2540)', () => {
  /** The check reports the event was already created for this slot (e.g. after a remount/refetch). */
  const alreadyScheduledResponse = {
    ...withProposalResponse,
    alreadyScheduled: true,
    eventLink: 'https://calendar.google.com/event?eid=already',
    meetLink: 'https://meet.google.com/already',
  };

  it('shows the event as scheduled (links, no conflict, no re-create) instead of "no free slot"', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: alreadyScheduledResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    // Goes straight to the scheduled view with the View link — never re-offers the create/confirm form.
    await waitFor(() => {
      expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.viewEvent')).toBeInTheDocument();
    });
    const viewLink = screen.getByText('emailDetail.schedulingRequest.proposedTime.viewEvent').closest('a');
    expect(viewLink).toHaveAttribute('href', alreadyScheduledResponse.eventLink);

    // A scheduled confirmation replaces any free/busy conflict warning.
    expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.scheduled')).toBeInTheDocument();
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.busyWindow')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.conflict')
    ).not.toBeInTheDocument();
    // Must not re-offer creating the invite (which would duplicate the event).
    expect(
      screen.queryByText('emailDetail.schedulingRequest.proposedTime.confirm')
    ).not.toBeInTheDocument();
  });
});

describe('SchedulingRequestCard — conflicting event details', () => {
  const conflictResponse = {
    ...withProposalResponse,
    isAvailable: false,
    suggestedTime: null,
    conflictingEvents: [
      { title: 'Standup', start: '2026-05-19T22:00:00Z', end: '2026-05-19T22:30:00Z' },
      { title: null, start: '2026-05-19', end: '2026-05-20' },
    ],
  };

  it('names the conflicting events under the conflict warning', async () => {
    mockedAxios.post.mockResolvedValue({ data: conflictResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(
        screen.getByText('emailDetail.schedulingRequest.proposedTime.conflict')
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Standup/)).toBeInTheDocument();
    // Untitled all-day event falls back to placeholder + all-day labels
    expect(
      screen.getByText(/proposedTime\.conflictEventUntitled/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/proposedTime\.conflictEventAllDay/)
    ).toBeInTheDocument();
  });

  it('shows no event list when the slot is free', async () => {
    mockedAxios.post.mockResolvedValue({ data: withProposalResponse });

    render(<SchedulingRequestCard email={makeEmail()} />);

    await waitFor(() => {
      expect(
        screen.getByText('emailDetail.schedulingRequest.proposedTime.available')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Standup/)).not.toBeInTheDocument();
  });
});
