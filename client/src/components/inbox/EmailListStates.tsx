import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxMode } from 'types/email';

import { AllCaughtUpState, EmptyState, ErrorState, LoadingState, ProgressiveUnlockPrompt } from 'components/inbox/states';
import { HIGH_PRIORITY_THRESHOLD, LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
}

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  onRetry: () => void;
  /** Current priority filter (null = no filter / show all) */
  minPriority?: number | null;
  /** Counts of threads in each priority tier — used for progressive unlock prompt */
  priorityCounts?: PriorityCounts | null;
  /** Called when user accepts the progressive unlock offer to a lower tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
}

/**
 * Email list states component
 * Handles loading, error, and empty states for email list.
 * When inbox is empty at the current priority tier, shows a ProgressiveUnlockPrompt
 * inviting the user to show the next lower priority tier.
 */
export const EmailListStates: React.FC<EmailListStatesProps> = ({
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  emailsEmpty,
  mode,
  onRetry,
  minPriority,
  priorityCounts,
  onUnlockPriorityTier,
  onDismissUnlockPrompt,
}) => {
  const { t } = useTranslation();
  const [isUnlockPromptDismissed, setIsUnlockPromptDismissed] = useState(false);

  /**
   * Handles "Maybe Later" — hides the prompt for this session without
   * changing the current priority tier (does NOT unlock all emails).
   */
  const handleDismissPrompt = () => {
    setIsUnlockPromptDismissed(true);
    onDismissUnlockPrompt?.();
  };

  if (loading || !hasInitiallyLoaded || loadingModeSwitch) {
    return <LoadingState decrypting={decrypting} loadingModeSwitch={loadingModeSwitch} mode={mode} />;
  }

  if (fetchError) {
    return <ErrorState error={fetchError} onRetry={onRetry} />;
  }

  if (emailsEmpty) {
    // Progressive unlock: offer to drop to the next lower priority tier
    if (
      !isUnlockPromptDismissed &&
      minPriority !== null &&
      minPriority !== undefined &&
      minPriority >= HIGH_PRIORITY_THRESHOLD &&
      priorityCounts &&
      priorityCounts.medium > 0 &&
      onUnlockPriorityTier &&
      onDismissUnlockPrompt
    ) {
      return (
        <ProgressiveUnlockPrompt
          message={t('inbox.progressiveUnlock.highDone')}
          nextTierLabel={t('inbox.progressiveUnlock.mediumLabel')}
          nextTierCount={priorityCounts.medium}
          onYes={() => onUnlockPriorityTier(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD)}
          onLater={handleDismissPrompt}
        />
      );
    }

    if (
      !isUnlockPromptDismissed &&
      minPriority !== null &&
      minPriority !== undefined &&
      minPriority >= MEDIUM_PRIORITY_THRESHOLD &&
      minPriority < HIGH_PRIORITY_THRESHOLD &&
      priorityCounts &&
      priorityCounts.low > 0 &&
      onUnlockPriorityTier &&
      onDismissUnlockPrompt
    ) {
      return (
        <ProgressiveUnlockPrompt
          message={t('inbox.progressiveUnlock.mediumDone')}
          nextTierLabel={t('inbox.progressiveUnlock.lowLabel')}
          nextTierCount={priorityCounts.low}
          onYes={() => onUnlockPriorityTier(LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD)}
          onLater={handleDismissPrompt}
        />
      );
    }

    // Final "all caught up" state: user reached low tier, completed it, nothing remains
    if (
      !isUnlockPromptDismissed &&
      minPriority !== null &&
      minPriority !== undefined &&
      minPriority < MEDIUM_PRIORITY_THRESHOLD &&
      priorityCounts &&
      priorityCounts.low === 0
    ) {
      return <AllCaughtUpState />;
    }

    return <EmptyState mode={mode} />;
  }

  return null;
};
