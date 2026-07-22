import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ProgressiveUnlockPromptProps {
  /** Action conversations waiting at the start of this Triage session. */
  actionCount: number;
  /** Follow-Up conversations waiting at the start of this Triage session. */
  followUpCount: number;
  /** Primary (healthy default): go deal with the waiting Action work. */
  onTakeAction: () => void;
  /** Secondary (de-emphasised): peek at the lower-priority new emails. */
  onPeek: () => void;
}

/**
 * Shown once the guided High-and-above Triage view is cleared but lower-priority
 * unread emails still exist. Congratulates the user, points them at their Action /
 * Follow-Up work, and makes the healthy default ("Take action") the prominent
 * choice — while still offering a de-emphasised opt-in to peek at the low-priority
 * emails (which triggers the friction exercise when work is still waiting).
 */
export const ProgressiveUnlockPrompt: React.FC<ProgressiveUnlockPromptProps> = ({
  actionCount,
  followUpCount,
  onTakeAction,
  onPeek,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, alignItems: 'center' }}>
        <button
          onClick={onTakeAction}
          data-testid="guided-take-action"
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.accent.success,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {t('inbox.guidedPeek.takeActionCta')}
        </button>
        <button
          onClick={onPeek}
          data-testid="guided-peek-cta"
          style={{
            padding: theme.spacing.xs,
            background: 'none',
            border: 'none',
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            textDecoration: 'underline',
            maxWidth: 420,
          }}
        >
          {t('inbox.guidedPeek.peekCta')}
        </button>
      </div>
    </div>
  );
};
