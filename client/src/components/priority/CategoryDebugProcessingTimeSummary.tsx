import React from 'react';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import type { CategoryRuleTraceSnapshot } from './CategoryDebugModal.types';

function formatTraceDate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleString();
}

const boxBaseStyle: React.CSSProperties = {
  marginBottom: theme.spacing.sm,
  padding: theme.spacing.sm,
  borderRadius: theme.borderRadius.sm,
  fontSize: theme.typography.fontSize.sm,
};

interface CategoryDebugProcessingTimeSummaryProps {
  /** The stored processing-time snapshot, or null/undefined when none was captured. */
  snapshot: CategoryRuleTraceSnapshot | null | undefined;
  /** Rule that wins the LIVE re-run, used to detect divergence from the snapshot. */
  liveWinningRuleId: string | null;
  translate: TFunction;
}

/**
 * Renders what the deterministic-rule step actually did when the thread's
 * category was last set — the stored snapshot — so the user can tell
 * "no rule matched at processing time" apart from "a rule matches now but was
 * created/enabled afterwards" (the central question this view answers).
 */
export const CategoryDebugProcessingTimeSummary: React.FC<
  CategoryDebugProcessingTimeSummaryProps
> = ({ snapshot, liveWinningRuleId, translate }) => {
  if (!snapshot) {
    return (
      <div
        style={{
          ...boxBaseStyle,
          backgroundColor: theme.colors.background.subtle,
          border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
          color: theme.colors.text.secondary,
        }}
      >
        <strong>{translate('priority.categoryDebug.traceProcessingTitle')}:</strong>{' '}
        {translate('priority.categoryDebug.traceProcessingNoRecord')}
      </div>
    );
  }

  const date = formatTraceDate(snapshot.evaluatedAt);
  const matchedNotWinningCount = snapshot.matchedButNotWinningRuleIds.length;
  // The category that wins the live re-run differs from what was applied at
  // processing time — almost always a rule created/enabled after the email ran.
  const diverged = (liveWinningRuleId ?? null) !== snapshot.winningRuleId;

  return (
    <div
      style={{
        ...boxBaseStyle,
        backgroundColor: theme.colors.background.subtle,
        border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
        color: theme.colors.text.primary,
      }}
    >
      <strong>{translate('priority.categoryDebug.traceProcessingTitle')}:</strong>{' '}
      {snapshot.winningRuleId
        ? translate('priority.categoryDebug.traceProcessingRuleMatched', {
            date,
            category: snapshot.winningRuleCategoryName ?? '',
          })
        : translate('priority.categoryDebug.traceProcessingNoRuleMatched', {
            date,
            count: snapshot.rulesConsideredCount,
          })}
      {matchedNotWinningCount > 0 ? (
        <div style={{ marginTop: theme.spacing.xs, color: theme.colors.text.secondary }}>
          {translate('priority.categoryDebug.traceProcessingMatchedNotApplied', {
            count: matchedNotWinningCount,
          })}
        </div>
      ) : null}
      {diverged ? (
        <div
          style={{
            marginTop: theme.spacing.xs,
            padding: theme.spacing.xs,
            backgroundColor: theme.colors.warning?.light || '#fff4e5',
            border: `1px solid ${theme.colors.warning?.main || '#ed6c02'}`,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.text.primary,
          }}
        >
          {translate('priority.categoryDebug.traceProcessingDivergence')}
        </div>
      ) : null}
    </div>
  );
};
