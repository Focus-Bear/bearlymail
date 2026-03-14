import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxMode } from 'types/email';

import { EmptyState, ErrorState, LoadingState, ProgressiveUnlockPrompt } from 'components/inbox/states';

/** Threshold at which the inbox is considered "high priority" for progressive unlock */
const HIGH_PRIORITY_THRESHOLD = 50;
/** Threshold at which the inbox is considered "medium priority" for progressive unlock */
const MEDIUM_PRIORITY_THRESHOLD = 20;

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
  onUnlockPriorityTier?: (newMinPriority: number) => void;
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
          onYes={() => onUnlockPriorityTier(MEDIUM_PRIORITY_THRESHOLD)}
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
          onYes={() => onUnlockPriorityTier(0)}
          onLater={handleDismissPrompt}
        />
      );
    }

    return <EmptyState mode={mode} />;
  }

  return null;
};
