/**
 * Visual story for the Triage entry pre-screen — the first gate shown when the
 * user opens Triage while they still have unfinished Action/Follow-Up work.
 * Renders INLINE in place of the Triage email list (not as a modal overlay).
 * Uses the real component + app i18n so the screenshot reflects production copy.
 */
import '../i18n';

import React from 'react';
import { theme } from 'theme/theme';

import { TriageEntryGate } from 'components/inbox/TriageEntryGate';

const meta = {
  title: 'Inbox/TriageEntryGate',
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const AreYouSure = {
  name: 'Triage entry gate — are you sure?',
  render: () => (
    // Mimic the Inbox content region: a fixed-height flex column so the inline
    // gate (which fills its parent via `flex: 1`) lays out as it does in the app.
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background.default,
      }}
    >
      <TriageEntryGate existingWorkCount={12} onSearch={() => undefined} onProceed={() => undefined} />
    </div>
  ),
};
