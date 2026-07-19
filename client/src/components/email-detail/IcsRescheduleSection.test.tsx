/**
 * Unit tests for IcsRescheduleSection — the reschedule-request (METHOD:COUNTER)
 * accept/decline UI added because BearlyMail had no handling for an attendee
 * declining an invite and proposing a new time.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { IcsInfoResponse } from 'types/ics-event';

import { IcsRescheduleSection } from './IcsRescheduleSection';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => {
  const translate = (key: string, opts?: Record<string, string>) =>
    opts?.name ? `${key}:${opts.name}` : key;
  return {
    useTranslation: () => ({ t: translate, i18n: { language: 'en' } }),
  };
});

function makeAxiosError(message?: string): Error & { isAxiosError: boolean; response: object } {
  const err = new Error('Axios error') as Error & { isAxiosError: boolean; response: object };
  err.isAxiosError = true;
  err.response = message ? { data: { message } } : {};
  return err;
}

function makeInfo(overrides: Partial<IcsInfoResponse> = {}): IcsInfoResponse {
  return {
    event: {
      uid: 'reschedule-uid',
      title: 'Fundraising tips and Snowie Fellowship',
      startAt: '2026-07-16T00:00:00.000Z',
      endAt: '2026-07-16T00:30:00.000Z',
      allDay: false,
      attendees: [
        {
          email: 'casey@example.com',
          name: 'Summer Petrosius',
          comment: "Sorry! I've woken up with a bad head cold and no voice",
        },
      ],
      isRecurring: false,
      method: 'COUNTER',
    },
    alreadyInCalendar: true,
    calendarEventId: 'gcal-event-1',
    currentStartAt: '2026-07-09T00:00:00.000Z',
    currentEndAt: '2026-07-09T00:30:00.000Z',
    ...overrides,
  };
}

describe('IcsRescheduleSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.isAxiosError as unknown as jest.Mock) = vi.fn(
      (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true
    );
  });

  it('shows who proposed the new time and their comment', () => {
    render(
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={makeInfo()} onResolved={vi.fn()} />
    );

    expect(screen.getByText('emailDetail.icsInvite.reschedule.proposedBy:Summer Petrosius')).toBeInTheDocument();
    expect(
      screen.getByText("“Sorry! I've woken up with a bad head cold and no voice”")
    ).toBeInTheDocument();
  });

  it('shows both the current and proposed time when they differ', () => {
    render(
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={makeInfo()} onResolved={vi.fn()} />
    );

    expect(screen.getByText(/emailDetail.icsInvite.reschedule.currentTime/)).toBeInTheDocument();
    expect(screen.getByText(/emailDetail.icsInvite.reschedule.proposedTime/)).toBeInTheDocument();
  });

  it('shows the no-match warning and no action buttons when the event is not on the calendar', () => {
    render(
      <IcsRescheduleSection
        emailId="email-1"
        attachmentId="att-1"
        info={makeInfo({ alreadyInCalendar: false, calendarEventId: undefined })}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByText('emailDetail.icsInvite.reschedule.noMatchWarning')).toBeInTheDocument();
    expect(screen.queryByTestId('reschedule-accept-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reschedule-decline-btn')).not.toBeInTheDocument();
  });

  it('accepts the new time, posts to accept-reschedule, and shows a confirmation', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { success: true, newStartAt: '2026-07-16T00:00:00.000Z', htmlLink: 'https://calendar.google.com/x' },
    });
    const onResolved = vi.fn();

    render(
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={makeInfo()} onResolved={onResolved} />
    );

    await userEvent.click(screen.getByTestId('reschedule-accept-btn'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/calendar/ics-info/email-1/att-1/accept-reschedule')
      );
    });
    expect(screen.getByText('emailDetail.icsInvite.reschedule.accepted')).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accepted', htmlLink: 'https://calendar.google.com/x' })
    );
    // Buttons are replaced by the confirmation — no further action possible.
    expect(screen.queryByTestId('reschedule-accept-btn')).not.toBeInTheDocument();
  });

  it('declines the new time and posts to decline-reschedule', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
    const onResolved = vi.fn();

    render(
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={makeInfo()} onResolved={onResolved} />
    );

    await userEvent.click(screen.getByTestId('reschedule-decline-btn'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/calendar/ics-info/email-1/att-1/decline-reschedule')
      );
    });
    expect(screen.getByText('emailDetail.icsInvite.reschedule.declined')).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ action: 'declined' }));
  });

  it('shows an error and keeps the buttons available on failure', async () => {
    mockedAxios.post.mockRejectedValue(makeAxiosError('Calendar event not found'));

    render(
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={makeInfo()} onResolved={vi.fn()} />
    );

    await userEvent.click(screen.getByTestId('reschedule-accept-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reschedule-error')).toHaveTextContent('Calendar event not found');
    });
    expect(screen.getByTestId('reschedule-accept-btn')).toBeInTheDocument();
  });
});
