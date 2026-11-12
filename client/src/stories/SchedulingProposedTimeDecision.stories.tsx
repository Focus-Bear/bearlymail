/**
 * Visual stories for the scheduling card when an email proposes a single time ("Would 11.30am
 * (Fremantle time) suit?"). Renders the real SchedulingRequestCard against a stubbed API so the
 * before (generic share-availability actions) and after (concrete decision) can be compared, plus
 * the reply each action drafts into the composer. Nothing is sent.
 */
import React, { useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import axios, { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import i18n from 'i18next';
import { Email } from 'types/email';

import { MeetingProposal, SchedulingRequestCard } from 'components/email-detail/SchedulingRequestCard';
import { AuthContext } from 'contexts/AuthContext';
import en from 'locales/en.json';

const storyI18n = i18n.createInstance();
storyI18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const meta = {
  title: 'EmailDetail/SchedulingProposedTimeDecision',
  parameters: { layout: 'padded' },
};
export default meta;

const CHECK_PROPOSAL_PATH = '/calendar/check-proposed-time/';

/** Synthetic thread — a time and a place, but no day. */
const email = {
  id: 'story-email',
  threadId: 'story-thread',
  isSnoozed: false,
  receivedAt: '2026-11-10T03:25:00Z',
  subject: 'Re: Assistive tech for students',
  from: 'access.team@example.edu',
  fromName: 'Example Access Team',
  to: 'you@example.com',
  body: 'Would 11.30am (Fremantle time) suit?',
  starCount: 1,
  isRead: false,
  category: 'Work',
  priorityScore: 60,
  date: '2026-11-10T03:25:00Z',
} as Email;

/** What check-proposed-time returned before: the LLM detector rejects a time with no day. */
const noProposal: MeetingProposal = {
  hasProposal: false,
  bookingInvited: false,
  proposedTime: null,
  windowEnd: null,
  proposedDate: null,
  proposedTimezone: null,
  proposedTimeText: null,
  topic: null,
  durationMinutes: null,
  isAvailable: null,
  suggestedTime: null,
  calendarConnected: false,
};

/** 11:30 Perth on Tue 10 Nov 2026 = 2:30pm Melbourne. */
const freeProposal: MeetingProposal = {
  ...noProposal,
  hasProposal: true,
  proposedTime: '2026-11-10T03:30:00.000Z',
  proposedTimezone: 'Australia/Perth',
  proposedTimeText: '11.30am (Fremantle time)',
  detectedBy: 'time_pattern',
  userTimezone: 'Australia/Melbourne',
  alternativeSlots: ['2026-11-10T02:30:00.000Z', '2026-11-10T03:00:00.000Z', '2026-11-10T04:00:00.000Z'],
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

function stubAdapter(proposal: MeetingProposal): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const data = config.url?.includes(CHECK_PROPOSAL_PATH)
      ? proposal
      : { meetLink: null, eventId: 'story-event', htmlLink: 'https://calendar.google.com/' };
    return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse);
  };
}

/** The composer receives "<p>…</p>" paragraphs; show them as plain text in the preview. */
function draftHtmlToText(html: string): string {
  return html
    .replace(/<\/p><p>/g, '\n\n')
    .replace(/<br>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

const storyAuth = {
  user: { id: 'story-user', email: 'you@example.com', isAdmin: true },
} as unknown as React.ContextType<typeof AuthContext>;

const CardWithDraftPreview: React.FC<{ proposal: MeetingProposal }> = ({ proposal }) => {
  axios.defaults.adapter = stubAdapter(proposal);
  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  return (
    <I18nextProvider i18n={storyI18n}>
      <AuthContext.Provider value={storyAuth}>
        <div style={{ maxWidth: 340, fontFamily: 'system-ui, sans-serif' }}>
          <SchedulingRequestCard email={email} onDraftReply={setDraftHtml} />
          {draftHtml && (
            <div
              data-testid="draft-preview"
              style={{ background: '#fff', border: '1px dashed #bbb', borderRadius: 8, padding: 12, fontSize: 13 }}
            >
              <strong>Draft placed in the reply composer (not sent):</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{draftHtmlToText(draftHtml)}</div>
            </div>
          )}
        </div>
      </AuthContext.Provider>
    </I18nextProvider>
  );
};

export const BeforeBareTimeNotDetected = {
  name: 'Before — bare time not detected',
  render: () => <CardWithDraftPreview proposal={noProposal} />,
};

export const AfterFree = {
  name: "After — free: Accept or suggest another",
  render: () => <CardWithDraftPreview proposal={freeProposal} />,
};

export const AfterBusy = {
  name: 'After — busy: leads with free alternatives',
  render: () => <CardWithDraftPreview proposal={busyProposal} />,
};
