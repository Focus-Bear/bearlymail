/**
 * Visual story for the Triage entry pre-screen — the first gate shown when the
 * user opens Triage while they still have unfinished Action/Follow-Up work.
 * Uses the real component + app i18n so the screenshot reflects production copy.
 */
import '../i18n';

import React from 'react';

import { TriageEntryGate } from 'components/inbox/TriageEntryGate';

const meta = {
  title: 'Inbox/TriageEntryGate',
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const AreYouSure = {
  name: 'Triage entry gate — are you sure?',
  render: () => (
    <TriageEntryGate
      existingWorkCount={12}
      onSearch={() => undefined}
      onProceed={() => undefined}
    />
  ),
};
