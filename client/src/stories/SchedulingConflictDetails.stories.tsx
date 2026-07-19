/**
 * Visual stories for the scheduling panel's conflict details: when the proposed
 * slot is busy, the warning now names the overlapping calendar events instead
 * of only saying "you have a conflict". Renders the real ProposedTimeCard with
 * a scoped i18n instance (safe in Storybook — availability re-check only fires
 * when the user edits the time).
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';

import { MeetingProposal, ProposedTimeCard } from 'components/email-detail/SchedulingRequestCard';

const schedulingI18n = i18n.createInstance();
schedulingI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.schedulingRequest.proposedTime.label': 'Proposed time',
        'emailDetail.schedulingRequest.proposedTime.editTitle': 'Review & confirm meeting details',
        'emailDetail.schedulingRequest.proposedTime.timeLabel': 'Date & time',
        'emailDetail.schedulingRequest.proposedTime.durationLabel': 'Duration',
        'emailDetail.schedulingRequest.proposedTime.durationMinutes': '{{minutes}} minutes',
        'emailDetail.schedulingRequest.proposedTime.topicLabel': 'Topic',
        'emailDetail.schedulingRequest.proposedTime.available': "✓ You're free at this time",
        'emailDetail.schedulingRequest.proposedTime.conflict': '⚠ You have a conflict at this time',
        'emailDetail.schedulingRequest.proposedTime.conflictEventUntitled': '(untitled event)',
        'emailDetail.schedulingRequest.proposedTime.conflictEventAllDay': 'all day',
        'emailDetail.schedulingRequest.proposedTime.confirm': 'Confirm & Create',
        'emailDetail.schedulingRequest.proposedTime.cancel': 'Cancel',
        'emailDetail.schedulingRequest.proposedTime.checkingAvailability': 'Checking availability…',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const meta = {
  title: 'EmailDetail/SchedulingConflictDetails',
  parameters: { layout: 'padded' },
};
export default meta;

const conflictProposal: MeetingProposal = {
  hasProposal: true,
  proposedTime: '2026-04-08T02:15:00Z',
  windowEnd: null,
  proposedDate: null,
  proposedTimeText: '8 April at 12:15 pm',
  topic: 'Catch up regarding ADHD and hobby project',
  durationMinutes: 30,
  isAvailable: false,
  suggestedTime: null,
  calendarConnected: true,
  conflictingEvents: [
    { title: 'Focus Bear standup', start: '2026-04-08T02:00:00Z', end: '2026-04-08T02:30:00Z' },
    { title: null, start: '2026-04-08', end: '2026-04-09' },
  ],
};

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={schedulingI18n}>
    <div style={{ maxWidth: 360, fontFamily: 'system-ui, sans-serif' }}>{children}</div>
  </I18nextProvider>
);

export const ConflictWithNamedEvents = {
  name: 'Conflict — overlapping events are named',
  render: () => (
    <Wrap>
      <ProposedTimeCard
        proposal={conflictProposal}
        creating={false}
        created={false}
        eventLink={null}
        meetLink={null}
        emailSubject="Catch up regarding ADHD and hobby project"
        onCreateInvite={() => undefined}
      />
    </Wrap>
  ),
};

export const FreeSlot = {
  name: 'Free slot — no event list',
  render: () => (
    <Wrap>
      <ProposedTimeCard
        proposal={{ ...conflictProposal, isAvailable: true, suggestedTime: conflictProposal.proposedTime, conflictingEvents: [] }}
        creating={false}
        created={false}
        eventLink={null}
        meetLink={null}
        emailSubject="Catch up regarding ADHD and hobby project"
        onCreateInvite={() => undefined}
      />
    </Wrap>
  ),
};
