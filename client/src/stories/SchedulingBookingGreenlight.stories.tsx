/**
 * Visual story for the "booking green-light" scheduling state: when the latest
 * reply invites you to send a calendar invite (e.g. "feel free to send a meeting
 * invite") and a concrete time is already on the table earlier in the thread,
 * the card now offers the editable Create Calendar Invite flow with honest
 * "confirm or pick a time" copy — instead of the generic share-availability card.
 *
 * Renders the real ProposedTimeCard (editable EditMeetingForm) inside the card
 * chrome, with a scoped i18n instance so it is self-contained in Storybook.
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
        'emailDetail.schedulingRequest.title': 'Scheduling request detected',
        'emailDetail.schedulingRequest.proposedTime.bookingInvitedDescription':
          'They invited you to send a calendar invite. Confirm or adjust the time below, then send it.',
        'emailDetail.schedulingRequest.proposedTime.label': 'Proposed time',
        'emailDetail.schedulingRequest.proposedTime.editTitle': 'Review & confirm meeting details',
        'emailDetail.schedulingRequest.proposedTime.timeLabel': 'Date & time',
        'emailDetail.schedulingRequest.proposedTime.durationLabel': 'Duration',
        'emailDetail.schedulingRequest.proposedTime.durationMinutes': '{{minutes}} minutes',
        'emailDetail.schedulingRequest.proposedTime.topicLabel': 'Topic',
        'emailDetail.schedulingRequest.proposedTime.confirm': 'Confirm & Create',
        'emailDetail.schedulingRequest.proposedTime.cancel': 'Cancel',
        'emailDetail.schedulingRequest.proposedTime.checkingAvailability': 'Checking availability…',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const meta = {
  title: 'EmailDetail/SchedulingBookingGreenlight',
  parameters: { layout: 'padded' },
};
export default meta;

// Jeremy earlier proposed 17 Aug 6:30pm ET; the sender declined that slot but green-lit an invite,
// so the earlier time is surfaced as an editable default (bookingInvited=true), never auto-booked.
const greenlightProposal: MeetingProposal = {
  hasProposal: true,
  bookingInvited: true,
  proposedTime: '2026-08-17T22:30:00Z',
  windowEnd: null,
  proposedDate: null,
  proposedTimeText: '17 August at 6:30 pm Eastern',
  topic: 'Intro chat with Brenda Luo',
  durationMinutes: 30,
  // Declined by the sender, not accepted — no confirmed availability verdict is shown.
  isAvailable: null,
  suggestedTime: null,
  calendarConnected: false,
};

/** Mirrors the card chrome the SchedulingRequestCard wraps ProposedTimeCard in. */
const GreenlightCard: React.FC = () => (
  <I18nextProvider i18n={schedulingI18n}>
    <div
      style={{
        maxWidth: 380,
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#ffffff',
        borderRadius: 8,
        border: '1px solid #0070f3',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#111' }}>
        <span>📅</span>
        <span>Scheduling request detected</span>
      </div>
      <div style={{ fontSize: 15, color: '#555', lineHeight: 1.5 }}>
        They invited you to send a calendar invite. Confirm or adjust the time below, then send it.
      </div>
      <ProposedTimeCard
        proposal={greenlightProposal}
        creating={false}
        created={false}
        eventLink={null}
        meetLink={null}
        emailSubject="Re: Intro chat"
        onCreateInvite={() => undefined}
      />
    </div>
  </I18nextProvider>
);

export const BookingGreenlightEditable = {
  name: 'Booking green-light — editable Create Invite',
  render: () => <GreenlightCard />,
};
