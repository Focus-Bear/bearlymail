/**
 * The one-glance decision for a single proposed time ("Would 11.30am (Fremantle time) suit?"):
 * the slot in both zones with a free/busy verdict, Accept & add to calendar, and Suggest another
 * time. Replies are only ever drafted into the composer — never sent.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { Email } from 'types/email';

import { hasProposedTimeDecision, MeetingProposal, SchedulingRequestCard } from './SchedulingRequestCard';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Echo interpolation values so the rendered summary and drafts can be asserted on.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.values(values).join('|')})` : key,
    i18n: { language: 'en-AU' },
  }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'me@example.com' } }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('config/api', () => ({
  API_URL: 'http://localhost:3001',
}));

const DECISION = 'emailDetail.schedulingRequest.decision';
const CHECK_PROPOSAL_PATH = '/calendar/check-proposed-time/';
const CREATE_EVENT_PATH = '/calendar/create-from-email-proposal';

/** Synthetic stand-in for the reported thread — a time and a place, no day. */
function makeEmail(): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    isSnoozed: false,
    receivedAt: '2026-11-10T03:25:00Z',
    subject: 'Re: Assistive tech for students',
    from: 'access.team@example.edu',
    fromName: 'Example Access Team',
    to: 'me@example.com',
    cc: 'colleague@example.edu',
    body: 'Would 11.30am (Fremantle time) suit?',
    starCount: 1,
    isRead: false,
    category: 'Work',
    priorityScore: 60,
    date: '2026-11-10T03:25:00Z',
  } as Email;
}

/** 11:30 Perth on Tue 10 Nov 2026 = 2:30pm Melbourne. */
const freeProposal: MeetingProposal = {
  hasProposal: true,
  bookingInvited: false,
  proposedTime: '2026-11-10T03:30:00.000Z',
  windowEnd: null,
  proposedDate: null,
  proposedTimezone: 'Australia/Perth',
  proposedTimeText: '11.30am (Fremantle time)',
  detectedBy: 'time_pattern',
  userTimezone: 'Australia/Melbourne',
  alternativeSlots: ['2026-11-10T02:30:00.000Z', '2026-11-10T03:00:00.000Z', '2026-11-10T04:00:00.000Z'],
  topic: null,
  durationMinutes: null,
  isAvailable: true,
  suggestedTime: '2026-11-10T03:30:00.000Z',
  calendarConnected: true,
  conflictingEvents: [],
};

const busyProposal: MeetingProposal = {
  ...freeProposal,
  isAvailable: false,
  suggestedTime: null,
  alternativeSlots: ['2026-11-10T02:00:00.000Z', '2026-11-10T02:30:00.000Z', '2026-11-10T05:00:00.000Z'],
  conflictingEvents: [{ title: 'Team planning', start: '2026-11-10T03:00:00Z', end: '2026-11-10T05:00:00Z' }],
};

function postedPaths(): string[] {
  return mockedAxios.post.mock.calls.map(([url]) => String(url));
}

async function renderCard(proposal: MeetingProposal, onDraftReply = vi.fn()) {
  mockedAxios.post.mockImplementation((url: string) => {
    if (url.includes(CHECK_PROPOSAL_PATH)) {
      return Promise.resolve({ data: proposal });
    }
    return Promise.resolve({ data: { meetLink: null, eventId: 'evt-1', htmlLink: 'https://calendar.example/evt-1' } });
  });
  render(<SchedulingRequestCard email={makeEmail()} onDraftReply={onDraftReply} />);
  await screen.findByTestId('proposed-time-decision');
  return onDraftReply;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hasProposedTimeDecision', () => {
  it('applies to a single checked time with alternatives', () => {
    expect(hasProposedTimeDecision(freeProposal)).toBe(true);
  });

  it.each([
    ['a window', { windowEnd: '2026-11-10T06:00:00Z' }],
    ['a booking green-light', { bookingInvited: true }],
    ['an unchecked calendar', { isAvailable: null }],
    ['an older server without alternatives', { alternativeSlots: undefined }],
    ['an already-booked slot', { alreadyScheduled: true }],
  ])('keeps the review form for %s', (_label, override) => {
    expect(hasProposedTimeDecision({ ...freeProposal, ...override })).toBe(false);
  });
});

describe('SchedulingRequestCard — proposed time decision (free)', () => {
  it("shows the sender's time, the user's time and date, and that they're free", async () => {
    await renderCard(freeProposal);

    expect(screen.getByText(new RegExp(`^${DECISION}\\.conversion\\(11:30\\s?am\\|Perth\\|2:30\\s?pm\\|Tue.*10 Nov\\)$`, 'i'))).toBeInTheDocument();
    expect(screen.getByText(`${DECISION}.free`)).toBeInTheDocument();
    expect(screen.getByText(`${DECISION}.accept`)).toBeInTheDocument();
    expect(screen.getByText(`${DECISION}.suggestAnother`)).toBeInTheDocument();
    // The generic share-availability actions are replaced by the concrete decision.
    expect(screen.queryByText('emailDetail.schedulingRequest.copyLink')).not.toBeInTheDocument();
  });

  it('Accept creates the event for everyone on the thread, then only drafts a confirmation', async () => {
    const onDraftReply = await renderCard(freeProposal);

    await userEvent.click(screen.getByText(`${DECISION}.accept`));

    await waitFor(() => expect(onDraftReply).toHaveBeenCalledTimes(1));
    expect(mockedAxios.post).toHaveBeenCalledWith(`http://localhost:3001${CREATE_EVENT_PATH}`, {
      emailId: 'email-1',
      proposedTime: freeProposal.proposedTime,
      topic: 'Re: Assistive tech for students',
      durationMinutes: 30,
      attendees: ['access.team@example.edu', 'colleague@example.edu'],
    });
    const draft = onDraftReply.mock.calls[0][0] as string;
    expect(draft).toContain(`${DECISION}.draftGreetingNamed(Example)`);
    expect(draft).toMatch(/draftAcceptBody\(.*slotInZone\(Tue.*10 Nov\|11:30\s?am\|Perth\)\)/i);
    // Nothing but the proposal check and the calendar event — no send endpoint is ever called.
    expect(postedPaths()).toEqual([
      `http://localhost:3001${CHECK_PROPOSAL_PATH}email-1`,
      `http://localhost:3001${CREATE_EVENT_PATH}`,
    ]);
    // Once booked, the card shows the scheduled event.
    expect(await screen.findByText('emailDetail.schedulingRequest.proposedTime.viewEvent')).toBeInTheDocument();
  });

  it('does not draft a confirmation when the calendar event could not be created', async () => {
    const onDraftReply = vi.fn();
    mockedAxios.post.mockImplementation((url: string) =>
      url.includes(CHECK_PROPOSAL_PATH) ? Promise.resolve({ data: freeProposal }) : Promise.reject(new Error('boom')),
    );
    render(<SchedulingRequestCard email={makeEmail()} onDraftReply={onDraftReply} />);
    await screen.findByTestId('proposed-time-decision');

    await userEvent.click(screen.getByText(`${DECISION}.accept`));

    expect(await screen.findByText(`${DECISION}.acceptFailed`)).toBeInTheDocument();
    expect(onDraftReply).not.toHaveBeenCalled();
  });

  it('Suggest another time drafts a reply listing the free alternatives without calling the server', async () => {
    const onDraftReply = await renderCard(freeProposal);

    await userEvent.click(screen.getByText(`${DECISION}.suggestAnother`));

    expect(onDraftReply).toHaveBeenCalledTimes(1);
    const draft = onDraftReply.mock.calls[0][0] as string;
    expect(draft).toMatch(/draftAlternativesIntro\(.*11:30\s?am\|Perth\)/i);
    expect(draft).toMatch(/- emailDetail\.schedulingRequest\.decision\.slotInZone\(Tue.*10 Nov\|10:30\s?am\|Perth\)/i);
    expect(draft).toMatch(/- emailDetail\.schedulingRequest\.decision\.slotInZone\(Tue.*10 Nov\|12:00\s?pm\|Perth\)/i);
    expect(postedPaths()).toEqual([`http://localhost:3001${CHECK_PROPOSAL_PATH}email-1`]);
  });

  it('Edit details opens the full review form', async () => {
    await renderCard(freeProposal);

    await userEvent.click(screen.getByText(`${DECISION}.editDetails`));

    expect(screen.getByText('emailDetail.schedulingRequest.proposedTime.editTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('proposed-time-decision')).not.toBeInTheDocument();
  });
});

describe('SchedulingRequestCard — proposed time decision (busy)', () => {
  it('says the user is busy, names the conflict and leads with the free alternatives', async () => {
    await renderCard(busyProposal);

    expect(screen.getByText(`${DECISION}.busy`)).toBeInTheDocument();
    expect(screen.getByText(/Team planning/)).toBeInTheDocument();
    expect(screen.getByText(`${DECISION}.alternativesHeading`)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    // No one-click accept into a conflict; the alternatives are the primary action.
    expect(screen.queryByText(`${DECISION}.accept`)).not.toBeInTheDocument();
    expect(screen.getByText(`${DECISION}.suggestAnother`)).toBeInTheDocument();
  });

  it('Suggest another time only drafts — nothing is sent or booked', async () => {
    const onDraftReply = await renderCard(busyProposal);

    await userEvent.click(screen.getByText(`${DECISION}.suggestAnother`));

    expect(onDraftReply).toHaveBeenCalledTimes(1);
    expect(postedPaths()).toEqual([`http://localhost:3001${CHECK_PROPOSAL_PATH}email-1`]);
  });

  it('explains when there are no free times nearby', async () => {
    await renderCard({ ...busyProposal, alternativeSlots: [] });

    expect(screen.getByText(`${DECISION}.noAlternatives`)).toBeInTheDocument();
    expect(screen.queryByText(`${DECISION}.suggestAnother`)).not.toBeInTheDocument();
  });
});
