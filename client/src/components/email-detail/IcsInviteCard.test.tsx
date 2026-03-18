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

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

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
    jest.clearAllMocks();
    // Make isAxiosError work properly in tests
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn((err: any) => err?.isAxiosError === true);
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
});
