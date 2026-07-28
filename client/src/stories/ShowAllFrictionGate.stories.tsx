/**
 * Visual stories for the "Show all emails" friction-gate fix.
 *
 * On the Triage tab, when no high-priority emails remain but lower-priority ones
 * do, the inbox shows FilteredEmptyState with a "Show all emails" button. Before
 * this fix that button cleared the priority filter outright — bypassing the
 * distraction-tax friction exercise even when the user still had unfinished
 * Action/Follow-Up work. Now, when a session-start snapshot of existing work is
 * present, "Show all emails" routes through the SAME friction gate as the
 * "well done" peek CTA. With no existing work, it still reveals directly.
 *
 * Uses the real components + app i18n so the screenshots reflect production copy.
 */
import '../i18n';

import React from 'react';
import { theme } from 'theme/theme';

import { DistractionFrictionModal } from 'components/inbox/DistractionFrictionModal';
import { FilteredEmptyState } from 'components/inbox/states';

const meta = {
  title: 'Inbox/ShowAllFrictionGate',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Mimics the inbox content column so the state lays out as it does in the app. */
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
    <div style={{ maxWidth: 720, width: '100%' }}>{children}</div>
  </div>
);

/**
 * Work waiting: the healthy default ("Take action 🐎") is the prominent primary,
 * and revealing lower-priority emails is a de-emphasised link that opens the
 * friction exercise below.
 */
export const FilteredEmptyWithWorkWaiting = {
  name: 'Filtered empty — work waiting (Take action primary, distract = gated link)',
  render: () => (
    <InboxColumn>
      <FilteredEmptyState
        currentTierLabel="High priority"
        lowerPriorityCount={9}
        hasExistingWork
        onTakeAction={() => undefined}
        onShowAll={() => undefined}
      />
    </InboxColumn>
  ),
};

/**
 * No work waiting: a single plain "Show all emails" button reveals directly, with
 * no "take action" primary (there is nothing to point the user at) and no friction.
 */
export const FilteredEmptyNoWork = {
  name: 'Filtered empty — no work (single "Show all emails", direct reveal)',
  render: () => (
    <InboxColumn>
      <FilteredEmptyState
        currentTierLabel="High priority"
        lowerPriorityCount={9}
        hasExistingWork={false}
        onShowAll={() => undefined}
      />
    </InboxColumn>
  ),
};

/**
 * What "Show all emails" now opens when work is waiting: the distraction-tax
 * friction exercise, exactly as the guided "well done" peek CTA does.
 */
export const ShowAllOpensFrictionGate = {
  name: 'Filtered empty — "Show all emails" opens the friction gate',
  render: () => (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background.default,
      }}
    >
      <DistractionFrictionModal existingWorkCount={10} onUnlock={() => undefined} onDismiss={() => undefined} />
    </div>
  ),
};
