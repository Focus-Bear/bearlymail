/**
 * Visual story for the reschedule-request (METHOD:COUNTER) card: an attendee
 * declined the invite and proposed a new time, and BearlyMail previously had
 * no way to act on that beyond the generic (misleading) Accept/Decline RSVP
 * buttons meant for a first-time invite.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { IcsInfoResponse } from 'types/ics-event';

import { IcsRescheduleSection } from 'components/email-detail/IcsRescheduleSection';

import { icsRescheduleI18n } from './storyHelpers/i18nInstances';

const meta = {
  title: 'EmailDetail/IcsRescheduleSection',
  parameters: { layout: 'padded' },
};
export default meta;

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={icsRescheduleI18n}>
    <div style={{ maxWidth: 520, fontFamily: 'system-ui, sans-serif' }}>{children}</div>
  </I18nextProvider>
);

const baseInfo: IcsInfoResponse = {
  event: {
    uid: 'f3a7pmefdvh0bpftdscvssu6jg@google.com',
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
    timezone: 'Australia/Sydney',
  },
  alreadyInCalendar: true,
  calendarEventId: 'gcal-event-1',
  currentStartAt: '2026-07-09T00:00:00.000Z',
  currentEndAt: '2026-07-09T00:30:00.000Z',
};

export const AcceptOrDecline = {
  name: 'Attendee proposed a new time — accept or decline',
  render: () => (
    <Wrap>
      <IcsRescheduleSection emailId="email-1" attachmentId="att-1" info={baseInfo} onResolved={() => undefined} />
    </Wrap>
  ),
};

export const NoMatchingCalendarEvent = {
  name: 'No matching event found on the calendar',
  render: () => (
    <Wrap>
      <IcsRescheduleSection
        emailId="email-1"
        attachmentId="att-1"
        info={{ ...baseInfo, alreadyInCalendar: false, calendarEventId: undefined }}
        onResolved={() => undefined}
      />
    </Wrap>
  ),
};
