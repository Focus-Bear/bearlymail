import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

interface ProgressiveUnlockPromptProps {
  /** Action conversations waiting at the start of this Triage session. */
  actionCount: number;
  /** Follow-Up conversations waiting at the start of this Triage session. */
  followUpCount: number;
  /** Called when the user asks to peek at the lower-priority new emails. */
  onPeek: () => void;
  /** Called when the user dismisses the prompt for this session. */
  onLater: () => void;
}

/**
 * Shown once the guided High-and-above Triage view is cleared but lower-priority
 * unread emails still exist. Congratulates the user, points them at their Action /
 * Follow-Up work, and offers a deliberate opt-in to peek at the low-priority
 * emails (which then triggers the friction exercise when work is still waiting).
 */
export const ProgressiveUnlockPrompt: React.FC<ProgressiveUnlockPromptProps> = ({
  actionCount,
  followUpCount,
  onPeek,
  onLater,
}) => {
  const { t } = useTranslation();

  const hasWork = actionCount > 0 || followUpCount > 0;
  const workSummary = t('inbox.guidedPeek.workSummary', {
    action: t('inbox.guidedPeek.actionCount', { count: actionCount }),
    followUp: t('inbox.guidedPeek.followUpCount', { count: followUpCount }),
  });

  return (
    <div
      style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px solid ${theme.colors.accent.success}`,
        boxShadow: `0 0 0 4px ${theme.colors.accent.success}20`,
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🎉</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('inbox.guidedPeek.title')}
      </h3>
      {hasWork && (
        <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>{workSummary}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, alignItems: 'center' }}>
        <button
          onClick={onPeek}
          data-testid="guided-peek-cta"
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.accent.success,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.sm,
            maxWidth: 420,
          }}
        >
          {t('inbox.guidedPeek.peekCta')}
        </button>
        <button
          onClick={onLater}
          data-testid="guided-peek-later"
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.guidedPeek.later')}
        </button>
      </div>
    </div>
  );
};
