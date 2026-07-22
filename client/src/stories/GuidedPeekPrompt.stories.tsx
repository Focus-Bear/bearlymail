/**
 * Visual story for the guided "well done" prompt — shown once the user has triaged
 * every High-and-above email but lower-priority unread emails remain. It
 * congratulates them, makes "Take action" the prominent healthy default, and keeps
 * a de-emphasised opt-in to peek at the low-priority emails (which then triggers
 * the friction exercise when work is still waiting). Uses the real component + app
 * i18n so the screenshot reflects production styling and copy.
 */
import '../i18n';

import React from 'react';
import { theme } from 'theme/theme';

import { ProgressiveUnlockPrompt } from 'components/inbox/states/ProgressiveUnlockPrompt';

const meta = {
  title: 'Inbox/GuidedPeekPrompt',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Mimic the inbox list column so the card lays out as it does in the app. */
const InboxColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      minHeight: '100vh',
      background: theme.colors.background.default,
      padding: theme.spacing.lg,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ maxWidth: 1000, width: '100%' }}>{children}</div>
  </div>
);

export const WithWaitingWork = {
  name: 'Well done — with waiting work',
  render: () => (
    <InboxColumn>
      <ProgressiveUnlockPrompt
        actionCount={5}
        followUpCount={2}
        onTakeAction={() => undefined}
        onPeek={() => undefined}
      />
    </InboxColumn>
  ),
};

export const NoWaitingWork = {
  name: 'Well done — nothing else waiting',
  render: () => (
    <InboxColumn>
      <ProgressiveUnlockPrompt
        actionCount={0}
        followUpCount={0}
        onTakeAction={() => undefined}
        onPeek={() => undefined}
      />
    </InboxColumn>
  ),
};
