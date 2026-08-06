/**
 * Storybook story documenting the new layout: whenever an email carries an `.ics`
 * attachment, the Calendar Invite card is hoisted ABOVE the email in the main column
 * (in every view mode). This renders a self-contained static representation of the
 * card's loaded state so the placement is visible without wiring the live axios fetch.
 */
import React from 'react';
import type { StoryObj } from '@storybook/react';

import { COLOR_WHITE, COLOR_WHITE_FULL } from 'constants/colors';

const Th = {
  border: '#E5E7EB',
  borderLight: '#F1F1F1',
  text: '#111827',
  textSec: '#6B7280',
  textTer: '#9CA3AF',
  success: '#059669',
  sp: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  r: { sm: '4px', md: '8px', lg: '12px', full: '999px' },
  f: { xs: '11px', sm: '13px', base: '15px', lg: '18px' },
};
const PRIMARY = '#E9902C';

const ATTENDEES = ['Alice Nguyen <alice@example.com>', 'Ben Carter <ben@example.com>', 'you@example.com'];

/** Static representation of IcsInviteCard in its loaded state. */
const InviteCard = () => (
  <div
    style={{
      backgroundColor: COLOR_WHITE_FULL,
      border: `1px solid ${Th.border}`,
      borderRadius: Th.r.lg,
      padding: Th.sp.lg,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: Th.sp.sm,
        marginBottom: Th.sp.md,
        paddingBottom: Th.sp.sm,
        borderBottom: `1px solid ${Th.borderLight}`,
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>📅</span>
      <h3 style={{ margin: 0, color: Th.text, fontWeight: 600, fontSize: Th.f.base }}>Calendar Invite</h3>
    </div>

    <div style={{ fontSize: Th.f.lg, fontWeight: 600, color: Th.text, marginBottom: Th.sp.sm }}>
      Q3 Planning Workshop
    </div>

    <div
      style={{ display: 'flex', gap: Th.sp.sm, marginBottom: Th.sp.sm, fontSize: Th.f.sm, color: Th.textSec }}
    >
      <span>🕐</span>
      <div>
        Wed, 13 Aug 2026, 10:00 AM
        <span style={{ color: Th.textTer }}> → 11:30 AM (AEST)</span>
      </div>
    </div>

    <div
      style={{ display: 'flex', gap: Th.sp.sm, marginBottom: Th.sp.sm, fontSize: Th.f.sm, color: Th.textSec }}
    >
      <span>📍</span>
      <span>Level 4, Boardroom · Google Meet link included</span>
    </div>

    <div
      style={{ display: 'flex', gap: Th.sp.sm, marginBottom: Th.sp.sm, fontSize: Th.f.sm, color: Th.textSec }}
    >
      <span>👤</span>
      <div>
        <strong>Organizer:</strong> Alice Nguyen &lt;alice@example.com&gt;
      </div>
    </div>

    <div style={{ display: 'flex', gap: Th.sp.sm, marginBottom: Th.sp.md, fontSize: Th.f.sm, color: Th.textSec }}>
      <span>👥</span>
      <div>
        <strong>Attendees:</strong>
        <div style={{ marginTop: Th.sp.xs }}>
          {ATTENDEES.map(attendee => (
            <div key={attendee}>{attendee}</div>
          ))}
        </div>
      </div>
    </div>

    <button
      style={{
        padding: `${Th.sp.sm} ${Th.sp.lg}`,
        backgroundColor: PRIMARY,
        color: COLOR_WHITE,
        border: 'none',
        borderRadius: Th.r.md,
        cursor: 'pointer',
        fontSize: Th.f.sm,
        fontWeight: 600,
      }}
    >
      Add to Calendar
    </button>
  </div>
);

/** Mock email header + body stub, with the invite card hoisted above it. */
const InviteAboveEmail = () => (
  <div style={{ maxWidth: 720, margin: '0 auto' }}>
    <div
      style={{
        backgroundColor: COLOR_WHITE_FULL,
        border: `1px solid ${Th.border}`,
        borderRadius: Th.r.lg,
        padding: Th.sp.lg,
      }}
    >
      {/* Calendar invite — now always at the very top of the email column */}
      <div style={{ marginBottom: Th.sp.xl }}>
        <InviteCard />
      </div>

      {/* Email header */}
      <div style={{ marginBottom: Th.sp.lg, paddingBottom: Th.sp.md, borderBottom: `1px solid ${Th.borderLight}` }}>
        <div style={{ fontSize: Th.f.lg, fontWeight: 600, color: Th.text, marginBottom: Th.sp.xs }}>
          Invitation: Q3 Planning Workshop
        </div>
        <div style={{ fontSize: Th.f.sm, color: Th.textSec }}>
          Alice Nguyen &lt;alice@example.com&gt; · Wed 6 Aug, 9:14 AM
        </div>
      </div>

      {/* Email body stub */}
      <div style={{ fontSize: Th.f.base, color: Th.text, lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>Hi team,</p>
        <p>
          Please find attached the calendar invite for our Q3 planning workshop. Let me know if the time works —
          the agenda and pre-read are in the linked doc.
        </p>
        <p style={{ marginBottom: 0, color: Th.textSec }}>Thanks,<br />Alice</p>
      </div>
    </div>
  </div>
);

const meta = { title: 'Email Detail/ICS Invite Above Email', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const InviteAboveTheEmail: Story = { name: 'Invite card above the email', render: () => <InviteAboveEmail /> };
