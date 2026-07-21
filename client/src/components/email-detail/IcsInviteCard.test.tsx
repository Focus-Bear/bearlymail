/**
 * Unit tests for IcsInviteCard — Axios error handling (#1116) and
 * Windows timezone crash (#1193)
 *
 * Verifies that axios.isAxiosError() is used for type-safe error handling
 * in both fetchIcsInfo and handleAddToCalendar catch blocks, and that
 * Windows-style timezone strings (e.g. "AUS Eastern Standard Time") do not
 * throw a RangeError crashing the card.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { Email } from 'types/email';

import { IcsInviteCard } from './IcsInviteCard';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock i18next. `t` and `i18n` must be stable references across renders (like
// real i18next), otherwise the component's fetchIcsInfo useCallback — which
// depends on `t` — is recreated every render, re-running its effect and
// clearing error state set by other handlers.
vi.mock('react-i18next', () => {
  const translate = (key: string) => key;
  const i18n = { language: 'en' };
  return {
    useTranslation: () => ({ t: translate, i18n }),
  };
});

function makeEmailWithIcs(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-ics-1',
    subject: 'Meeting invite',
    from: 'organizer@example.com',
    starCount: 0,
    isRead: true,
    category: 'Work',
    priorityScore: 50,
    date: new Date().toISOString(),
    attachments: [
      {
        attachmentId: 'att-1',
        filename: 'invite.ics',
        mimeType: 'text/calendar',
        size: 1024,
      },
    ],
    ...overrides,
  } as Email;
}

function makeAxiosError(message?: string): Error & { isAxiosError: boolean; response: object } {
  const err = new Error('Axios error') as Error & { isAxiosError: boolean; response: object };
  err.isAxiosError = true;
  err.response = message ? { data: { message } } : {};
  return err;
}

describe('IcsInviteCard — error handling (#1116)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make isAxiosError work properly in tests
    (axios.isAxiosError as unknown as jest.Mock) = vi.fn(
      (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true
    );
  });

  describe('fetchIcsInfo error handling', () => {
    it('shows server message when Axios error has response.data.message', async () => {
      const err = makeAxiosError('ICS parsing failed');
      mockedAxios.get.mockRejectedValue(err);

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByText(/Could not parse calendar invite: ICS parsing failed/i)).toBeInTheDocument();
      });
    });

    it('shows fallback i18n message when non-Axios error is thrown', async () => {
      const err = new Error('Network failure');
      mockedAxios.get.mockRejectedValue(err);

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByText('emailDetail.icsInvite.error')).toBeInTheDocument();
      });
    });

    it('shows fallback i18n message when Axios error has no message', async () => {
      const err = makeAxiosError(undefined);
      mockedAxios.get.mockRejectedValue(err);

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByText('emailDetail.icsInvite.error')).toBeInTheDocument();
      });
    });
  });

  describe('Windows timezone crash (#1193)', () => {
    it('renders date/time without crashing when timezone is a Windows-style string', async () => {
      const icsInfo = {
        event: {
          uid: 'win-tz-uid',
          title: 'Windows TZ Meeting',
          startAt: '2026-03-20T09:00:00Z',
          endAt: '2026-03-20T09:30:00Z',
          timezone: 'AUS Eastern Standard Time', // Windows tz — must not throw RangeError
          allDay: false,
          attendees: [],
          isRecurring: false,
        },
        alreadyInCalendar: false,
      };
      mockedAxios.get.mockResolvedValue({ data: icsInfo });

      expect(() => render(<IcsInviteCard email={makeEmailWithIcs()} />)).not.toThrow();

      await waitFor(() => {
        expect(screen.getByText('Windows TZ Meeting')).toBeInTheDocument();
      });
    });

    it('renders date/time without crashing when timezone is "Eastern Standard Time"', async () => {
      const icsInfo = {
        event: {
          uid: 'est-uid',
          title: 'Eastern Time Meeting',
          startAt: '2026-03-20T14:00:00Z',
          endAt: '2026-03-20T15:00:00Z',
          timezone: 'Eastern Standard Time',
          allDay: false,
          attendees: [],
          isRecurring: false,
        },
        alreadyInCalendar: false,
      };
      mockedAxios.get.mockResolvedValue({ data: icsInfo });

      expect(() => render(<IcsInviteCard email={makeEmailWithIcs()} />)).not.toThrow();

      await waitFor(() => {
        expect(screen.getByText('Eastern Time Meeting')).toBeInTheDocument();
      });
    });
  });

  describe('RSVP status and actions (#1493)', () => {
    const makeIcsInfoWithRsvp = (rsvpStatus: string = 'needsAction', htmlLink?: string) => ({
      event: {
        uid: 'rsvp-uid',
        title: 'RSVP Meeting',
        startAt: '2026-03-20T09:00:00Z',
        endAt: '2026-03-20T09:30:00Z',
        allDay: false,
        attendees: [],
        isRecurring: false,
      },
      alreadyInCalendar: true,
      calendarEventId: 'gcal-123',
      userResponseStatus: rsvpStatus,
      htmlLink,
    });

    it('renders RSVP status badge when alreadyInCalendar is true', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('accepted') });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-status-badge')).toBeInTheDocument();
        expect(screen.getByText('emailDetail.icsInvite.rsvpStatus.accepted')).toBeInTheDocument();
      });
    });

    it('renders RSVP action buttons', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('needsAction') });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-btn-accepted')).toBeInTheDocument();
        expect(screen.getByTestId('rsvp-btn-tentative')).toBeInTheDocument();
        expect(screen.getByTestId('rsvp-btn-declined')).toBeInTheDocument();
      });
    });

    it('disables the button matching current RSVP status', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('accepted') });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-btn-accepted')).toBeDisabled();
        expect(screen.getByTestId('rsvp-btn-tentative')).not.toBeDisabled();
        expect(screen.getByTestId('rsvp-btn-declined')).not.toBeDisabled();
      });
    });

    it('calls RSVP endpoint when clicking Accept', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('needsAction') });
      mockedAxios.post.mockResolvedValue({
        data: { userResponseStatus: 'accepted', htmlLink: 'https://calendar.google.com/event?eid=abc' },
      });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      const acceptBtn = await screen.findByTestId('rsvp-btn-accepted');
      await userEvent.click(acceptBtn);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/calendar/event/gcal-123/rsvp'), {
          response: 'accepted',
        });
      });
    });

    it('shows error on RSVP failure', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('needsAction') });
      const err = makeAxiosError('Event not found');
      mockedAxios.post.mockRejectedValue(err);

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      const declineBtn = await screen.findByTestId('rsvp-btn-declined');
      await userEvent.click(declineBtn);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-error')).toBeInTheDocument();
      });
    });

    it('renders "View in Calendar" link when htmlLink is available', async () => {
      mockedAxios.get.mockResolvedValue({
        data: makeIcsInfoWithRsvp('accepted', 'https://calendar.google.com/event?eid=abc'),
      });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        const link = screen.getByTestId('view-in-calendar-link');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', 'https://calendar.google.com/event?eid=abc');
      });
    });

    it('does not render "View in Calendar" link when htmlLink is absent', async () => {
      mockedAxios.get.mockResolvedValue({ data: makeIcsInfoWithRsvp('accepted') });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-status-badge')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('view-in-calendar-link')).not.toBeInTheDocument();
    });
  });

  describe('handleAddToCalendar error handling', () => {
    it('shows server message when Axios error has response.data.message', async () => {
      const icsInfo = {
        event: {
          uid: 'standup-uid',
          title: 'Team Standup',
          startAt: '2026-03-20T09:00:00Z',
          endAt: '2026-03-20T09:30:00Z',
          allDay: false,
          attendees: [],
          isRecurring: false,
        },
        alreadyInCalendar: false,
      };
      mockedAxios.get.mockResolvedValue({ data: icsInfo });

      const calendarErr = makeAxiosError('Calendar quota exceeded');
      mockedAxios.post.mockRejectedValue(calendarErr);

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      // Wait for the card to load and the "Add to Calendar" button to appear
      // (i18n is mocked to return the key, so match on the translation key)
      const addButton = await screen.findByRole('button', { name: /icsInvite\.addToCalendar/i });
      await userEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/Could not add event to calendar: Calendar quota exceeded/i)).toBeInTheDocument();
      });
    });
  });

  describe('reschedule requests (METHOD:COUNTER)', () => {
    const counterIcsInfo = {
      event: {
        uid: 'reschedule-uid',
        title: 'Fundraising tips and Snowie Fellowship',
        startAt: '2026-07-16T00:00:00.000Z',
        endAt: '2026-07-16T00:30:00.000Z',
        allDay: false,
        attendees: [{ email: 'jordan@example.com', name: 'Jordan Lee' }],
        isRecurring: false,
        method: 'COUNTER',
      },
      alreadyInCalendar: true,
      calendarEventId: 'gcal-event-1',
      userResponseStatus: 'accepted',
    };

    it('renders the reschedule section instead of the generic RSVP buttons', async () => {
      mockedAxios.get.mockResolvedValue({ data: counterIcsInfo });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('ics-reschedule-section')).toBeInTheDocument();
      });
      // The generic Accept/Tentative/Decline RSVP buttons are not meaningful
      // for a reschedule request and must not render alongside it.
      expect(screen.queryByTestId('rsvp-btn-accepted')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rsvp-btn-tentative')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rsvp-btn-declined')).not.toBeInTheDocument();
    });

    it('renders the normal RSVP buttons for a plain (non-COUNTER) invite', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { ...counterIcsInfo, event: { ...counterIcsInfo.event, method: undefined } },
      });

      render(<IcsInviteCard email={makeEmailWithIcs()} />);

      await waitFor(() => {
        expect(screen.getByTestId('rsvp-btn-accepted')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('ics-reschedule-section')).not.toBeInTheDocument();
    });
  });
});
