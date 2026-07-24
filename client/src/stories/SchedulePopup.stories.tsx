/**
 * SchedulePopup.stories.tsx — Storybook stories for the reply Send → Schedule
 * dropdown. Renders the REAL SchedulePopup component.
 *
 * The `BeforeCutoff` story freezes the clock to 06:15 local so the conditional
 * "Today 8:30am" quick option is always shown first; `AfterCutoff` freezes it
 * to mid-morning so the option is correctly absent.
 */
import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { SchedulePopup } from 'components/email-detail-inline/SchedulePopup';

const RealDate = Date;

/**
 * Freezes the global clock to a fixed local time for its subtree so the
 * time-of-day-dependent suggestions render deterministically, restoring the
 * real Date on unmount.
 */
const FrozenClock: React.FC<{ isoLocal: string; children: React.ReactNode }> = ({ isoLocal, children }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fixed = new RealDate(isoLocal).getTime();
    // SchedulePopup only calls `new Date()` and `new Date(existingDate)`, so a
    // single-value constructor override is sufficient to freeze "now".
    class MockDate extends RealDate {
      constructor(value?: number | string | Date) {
        super(value === undefined ? fixed : value);
      }
      static now(): number {
        return fixed;
      }
    }
    (globalThis as { Date: DateConstructor }).Date = MockDate as unknown as DateConstructor;
    setReady(true);
    return () => {
      (globalThis as { Date: DateConstructor }).Date = RealDate;
    };
  }, [isoLocal]);
  if (!ready) {
    return null;
  }
  return <>{children}</>;
};

const PopupHost: React.FC<{ isoLocal: string }> = ({ isoLocal }) => (
  <I18nextProvider i18n={i18n}>
    <div style={{ position: 'relative', height: 320, width: 360 }}>
      <div style={{ position: 'absolute', bottom: 0, right: 0 }}>
        <FrozenClock isoLocal={isoLocal}>
          <SchedulePopup onSelectSuggestion={() => {}} onPickCustom={() => {}} onClose={() => {}} />
        </FrozenClock>
      </div>
    </div>
  </I18nextProvider>
);

const meta: Meta<typeof PopupHost> = {
  title: 'EmailDetail/SchedulePopup',
  component: PopupHost,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof PopupHost>;

export const BeforeCutoff: Story = {
  name: 'Before 08:30 — with "Today 8:30am"',
  args: { isoLocal: '2026-07-20T06:15:00' },
};

export const AfterCutoff: Story = {
  name: 'After 08:30 — no early-morning option',
  args: { isoLocal: '2026-07-20T09:30:00' },
};
