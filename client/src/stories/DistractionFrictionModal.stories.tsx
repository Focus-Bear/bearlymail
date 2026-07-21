/**
 * Visual story for the Triage "distraction tax" friction exercise — shown when
 * the user has unfinished work (Action/Follow-Up) and insists on peeking at
 * lower-priority new emails. Renders INLINE in place of the Triage email list
 * (not as a modal overlay). Uses the real component + app i18n so the screenshot
 * reflects production styling and copy.
 */
import '../i18n';

import React from 'react';
import { theme } from 'theme/theme';

import { DistractionFrictionModal } from 'components/inbox/DistractionFrictionModal';

const meta = {
  title: 'Inbox/DistractionFrictionModal',
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const ChooseYourUnlock = {
  name: 'Distraction tax — choose your unlock',
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
      <DistractionFrictionModal existingWorkCount={12} onUnlock={() => undefined} onDismiss={() => undefined} />
    </div>
  ),
};
