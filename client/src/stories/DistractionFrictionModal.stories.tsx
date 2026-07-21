/**
 * Visual story for the Triage "distraction tax" friction modal — shown when the
 * user has unfinished work (Action/Follow-Up) and tries to peek at lower-priority
 * new emails. Uses the real component + app i18n so the screenshot reflects
 * production styling and copy.
 */
import '../i18n';

import React from 'react';

import { DistractionFrictionModal } from 'components/inbox/DistractionFrictionModal';

const meta = {
  title: 'Inbox/DistractionFrictionModal',
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const ChooseYourUnlock = {
  name: 'Distraction tax — choose your unlock',
  render: () => (
    <DistractionFrictionModal
      existingWorkCount={12}
      onUnlock={() => undefined}
      onDismiss={() => undefined}
    />
  ),
};
