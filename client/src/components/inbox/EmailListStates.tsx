import React from 'react';
import { useTranslation } from 'react-i18next';
import { InboxMode } from 'types/email';

import {
  AllCaughtUpState,
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  LoadingState,
  ProgressiveUnlockPrompt,
  SyncingState,
} from 'components/inbox/states';
import { MODE_TRIAGE } from 'constants/strings';
import {
  HIGH_PRIORITY_THRESHOLD,
  LOW_PRIORITY_THRESHOLD,
  MEDIUM_PRIORITY_THRESHOLD,
  VERY_HIGH_PRIORITY_THRESHOLD,
} from 'hooks/useInboxFilters';

interface PriorityCounts {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
  unprioritised?: number;
}

/**
 * The guided default Triage view shows High-and-above emails (min at the High
 * floor, no upper cap). Detecting exactly this view is what distinguishes the
 * guided "well done, want to peek?" prompt from a manually-chosen bounded bucket.
 */
function isGuidedHighAndAboveView(minPriority: number | null | undefined, maxPriority: number | null | undefined): boolean {
  return minPriority === HIGH_PRIORITY_THRESHOLD && (maxPriority === null || maxPriority === undefined);
}

/**
 * Compute the total count of emails in priority tiers below the given minPriority.
 * Used to detect whether a filtered-empty state is misleading (lower emails exist).
 */
function computeTotalLowerPriority(minPriority: number, counts: PriorityCounts): number {
  let total = 0;
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD) {
    total += counts.high;
  }
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) {
    total += counts.medium;
  }
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD) {
    total += counts.low;
  }
  if (minPriority >= LOW_PRIORITY_THRESHOLD) {
    total += counts.veryLow;
  }
  return total;
}

/**
 * Human-readable label for the current active priority filter tier.
 */
function getCurrentTierLabel(minPriority: number, translate: (key: string) => string): string {
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.veryHigh');
  }
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.high');
  }
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD) {
    return translate('inbox.priority.medium');
  }
  return translate('inbox.priority.low');
}

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  /**
   * True when a mailbox sync is in progress. When the inbox would otherwise
   * show the generic empty state, a "Syncing your mailbox…" state is shown
   * instead so the user knows emails are still on their way.
   */
  isSyncing?: boolean;
  onRetry: () => void;
  /** Current priority filter lower bound (null = no lower bound / show all) */
  minPriority?: number | null;
  /** Current priority filter upper bound (null = no upper cap) */
  maxPriority?: number | null;
  /** Counts of threads in each priority tier — used for the guided peek prompt */
  priorityCounts?: PriorityCounts | null;
  /** Action conversations waiting at the start of this Triage session (for the peek prompt copy) */
  existingActionCount?: number;
  /** Follow-Up conversations waiting at the start of this Triage session (for the peek prompt copy) */
  existingFollowUpCount?: number;
  /** Primary CTA on the guided peek prompt: go deal with the waiting Action work. */
  onTakeAction?: () => void;
  /** Called when user asks to peek at lower-priority emails (min=null, max=High floor) */
  onUnlockPriorityTier?: (minPriority: number | null, maxPriority: number | null) => void;
  /** Called when user clicks "Show all emails" to clear the priority filter */
  onClearFilters?: () => void;
}

interface EmptyInboxProps {
  t: (key: string) => string;
  minPriority: number | null | undefined;
  maxPriority: number | null | undefined;
  priorityCounts: PriorityCounts | null | undefined;
  existingActionCount: number;
  existingFollowUpCount: number;
  mode: InboxMode;
  onTakeAction?: () => void;
  onUnlockPriorityTier?: (minPriority: number | null, maxPriority: number | null) => void;
  onClearFilters?: () => void;
}

/**
 * Renders the appropriate state when the email list is empty.
 * Extracted to reduce complexity of the parent component.
 *
 * Decision tree:
 * 1. Guided peek prompt — Triage only, guided High-and-above view cleared, pre-existing
 *    Action/Follow-Up work waiting, lower emails exist → ProgressiveUnlockPrompt
 * 2. All caught up — filter active, priorityCounts loaded, ALL lower tiers empty → AllCaughtUpState
 * 3. Filtered but lower emails exist — filter active, priorityCounts loaded, lower > 0 → FilteredEmptyState
 * 4. Genuine empty / loading — no filter, or priorityCounts still loading → EmptyState
 *
 * The guided peek prompt is a Triage-guided-flow element: it must NEVER render in the
 * Action or Follow-Up tabs (those show their own empty state). It also only makes sense
 * when there IS pre-existing Action/Follow-Up work to point the user at — with none, the
 * "go do your other work" premise doesn't hold, so the Triage list simply reveals the
 * remaining lower-priority threads (handled in Inbox.tsx) instead of gating here.
 */
function EmptyInboxContent({
  t,
  minPriority,
  maxPriority,
  priorityCounts,
  existingActionCount,
  existingFollowUpCount,
  mode,
  onTakeAction,
  onUnlockPriorityTier,
  onClearFilters,
}: EmptyInboxProps): React.ReactElement {
  const hasActiveFilter =
    (minPriority !== null && minPriority !== undefined) || (maxPriority !== null && maxPriority !== undefined);
  // The gate/prompt is only meaningful when the user has pre-existing Action or
  // Follow-Up work to be pointed at (a snapshot taken at Triage session start).
  const hasExistingWork = existingActionCount > 0 || existingFollowUpCount > 0;

  // 1. Guided peek prompt: Triage only (never the Action/Follow-Up tabs), for the
  //    guided High-and-above view (not a manually chosen bounded bucket), once it's
  //    cleared, lower-priority emails remain, AND there is pre-existing work waiting.
  if (
    mode === MODE_TRIAGE &&
    hasExistingWork &&
    isGuidedHighAndAboveView(minPriority, maxPriority) &&
    priorityCounts &&
    onTakeAction &&
    onUnlockPriorityTier
  ) {
    const lowerCount = computeTotalLowerPriority(minPriority as number, priorityCounts);
    if (lowerCount > 0) {
      return (
        <ProgressiveUnlockPrompt
          actionCount={existingActionCount}
          followUpCount={existingFollowUpCount}
          onTakeAction={onTakeAction}
          onPeek={() => onUnlockPriorityTier(null, HIGH_PRIORITY_THRESHOLD)}
        />
      );
    }
  }

  // 2 & 3 require priorityCounts to be loaded — guard here.
  if (hasActiveFilter && priorityCounts) {
    // 2. True "all caught up" — every lower tier (across all bands) is genuinely empty.
    const allLowerTiersEmpty =
      priorityCounts.high === 0 &&
      priorityCounts.medium === 0 &&
      priorityCounts.low === 0 &&
      priorityCounts.veryLow === 0;

    if (allLowerTiersEmpty) {
      return <AllCaughtUpState />;
    }

    // 3. Filter active, lower-priority emails exist (dismissed or bounded bucket).
    //    Show FilteredEmptyState rather than the misleading generic EmptyState.
    const totalLower = computeTotalLowerPriority(minPriority as number, priorityCounts);
    const displayCount =
      totalLower > 0
        ? totalLower
        : priorityCounts.high + priorityCounts.medium + priorityCounts.low + priorityCounts.veryLow;

    return (
      <FilteredEmptyState
        currentTierLabel={getCurrentTierLabel(minPriority as number, t)}
        lowerPriorityCount={displayCount}
        onShowAll={onClearFilters}
      />
    );
  }

  // 4. No filter active, or priorityCounts not yet loaded — fall back to generic EmptyState.
  return <EmptyState mode={mode} />;
}

/**
 * Email list states component
 * Handles loading, error, and empty states for email list.
 * When the guided High-and-above Triage view is cleared and lower-priority emails
 * still exist, shows a friendly "well done" prompt inviting the user to peek.
 */
export const EmailListStates: React.FC<EmailListStatesProps> = ({
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  emailsEmpty,
  mode,
  isSyncing,
  onRetry,
  minPriority,
  maxPriority,
  priorityCounts,
  existingActionCount = 0,
  existingFollowUpCount = 0,
  onTakeAction,
  onUnlockPriorityTier,
  onClearFilters,
}) => {
  const { t } = useTranslation();

  if (loading || !hasInitiallyLoaded || loadingModeSwitch) {
    return <LoadingState decrypting={decrypting} loadingModeSwitch={loadingModeSwitch} mode={mode} />;
  }

  if (fetchError) {
    return <ErrorState error={fetchError} onRetry={onRetry} />;
  }

  if (emailsEmpty) {
    // While a mailbox sync is running and no priority filter is narrowing the
    // view, the inbox is empty simply because emails haven't arrived yet. Show
    // the friendly "Syncing…" state instead of the misleading "all caught up"
    // empty state. A filter being active means real emails exist elsewhere, so
    // let EmptyInboxContent handle those (peek prompt / filtered empty).
    const hasActiveFilter =
      (minPriority !== null && minPriority !== undefined) || (maxPriority !== null && maxPriority !== undefined);
    if (isSyncing && !hasActiveFilter) {
      return <SyncingState />;
    }

    return (
      <EmptyInboxContent
        t={t}
        minPriority={minPriority}
        maxPriority={maxPriority}
        priorityCounts={priorityCounts}
        existingActionCount={existingActionCount}
        existingFollowUpCount={existingFollowUpCount}
        mode={mode}
        onTakeAction={onTakeAction}
        onUnlockPriorityTier={onUnlockPriorityTier}
        onClearFilters={onClearFilters}
      />
    );
  }

  return null;
};
