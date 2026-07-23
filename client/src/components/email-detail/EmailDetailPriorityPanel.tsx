/**
 * EmailDetailPriorityPanel — always-visible priority debug panel for the full-page
 * email-detail view.
 *
 * Surfaces the priority score, the score breakdown (urgency / goal alignment /
 * sentiment / VIP dimensions) and the category + "Categorised by …" provenance
 * line WITHOUT requiring a click, so users can debug why an email wasn't
 * prioritised to the top of their inbox.
 *
 * Presentational only: takes `t` and plain data props (no hooks/providers), so it
 * renders directly in Storybook and unit tests — mirroring EmailDetailHeaderView.
 */
import React from 'react';
import { theme } from 'theme/theme';
import {
  CategorizationSource,
  Email,
  getEmailPriorityScore,
  isEmailPriorityCalculating,
  isEmailPriorityUnresolved,
} from 'types/email';
import { getPriorityBadge } from 'utils/priorityUtils';

import { EMOJI_SETTINGS } from 'constants/emojis';

import { PriorityExplanation } from './EmailDetailHeaderView';

/** i18n key (under `priority.tooltip.categorisedBy`) for each provenance kind. */
const CATEGORISATION_SOURCE_LABEL_KEYS: Record<CategorizationSource, string> = {
  ai: 'priority.tooltip.categorisedBy.ai',
  rule: 'priority.tooltip.categorisedBy.rule',
  local: 'priority.tooltip.categorisedBy.local',
  proto: 'priority.tooltip.categorisedBy.proto',
  user: 'priority.tooltip.categorisedBy.user',
};

export interface EmailDetailPriorityPanelProps {
  email: Email;
  priorityExplanation: PriorityExplanation | null;
  /** Triggers a fresh fetch/calculation — used as a retry when priority is unresolved. */
  onRecalculate: () => void;
  onNavigateToSettings?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const panelStyle: React.CSSProperties = {
  marginBottom: theme.spacing.lg,
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.subtle,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
};

const breakdownRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
  fontSize: theme.typography.fontSize.sm,
};

const ScoreHeadline: React.FC<{
  email: Email;
  onRecalculate: () => void;
  t: EmailDetailPriorityPanelProps['t'];
}> = ({ email, onRecalculate, t }) => {
  if (isEmailPriorityCalculating(email)) {
    return (
      <span style={{ color: theme.colors.text.secondary, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('emailDetail.priorityPanel.calculating')}
      </span>
    );
  }

  if (isEmailPriorityUnresolved(email)) {
    return (
      <button
        type="button"
        onClick={onRecalculate}
        title={t('emailDetail.priorityPanel.notCalculatedHint')}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          color: theme.colors.accent.warning,
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.lg,
          textDecoration: 'underline',
        }}
      >
        {t('emailDetail.priorityPanel.notCalculated')}
      </button>
    );
  }

  const score = getEmailPriorityScore(email);
  const badge = getPriorityBadge(score, t);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        borderRadius: theme.borderRadius.full,
        backgroundColor: badge.bg,
        color: badge.color,
        fontWeight: theme.typography.fontWeight.bold,
        fontSize: theme.typography.fontSize.lg,
      }}
    >
      {t('emailDetail.priorityScore', { score: score.toFixed(0) })}
      <span style={{ fontWeight: theme.typography.fontWeight.medium }}>({badge.label})</span>
    </span>
  );
};

const CategoryLine: React.FC<{ email: Email; t: EmailDetailPriorityPanelProps['t'] }> = ({ email, t }) => {
  const category = email.category || t('emailDetail.priorityPanel.uncategorised');
  const source = email.categorizationSource;
  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
        {t('emailDetail.priorityPanel.category', { category })}
      </span>
      {source && (
        <span>
          {' · '}
          {t('emailDetail.priorityPanel.categorisedBy', { source: t(CATEGORISATION_SOURCE_LABEL_KEYS[source]) })}
        </span>
      )}
    </div>
  );
};

const ScoreBreakdown: React.FC<{
  priorityExplanation: PriorityExplanation | null;
  email: Email;
  t: EmailDetailPriorityPanelProps['t'];
}> = ({ priorityExplanation, email, t }) => {
  const breakdown = priorityExplanation?.breakdown ?? [];

  if (breakdown.length === 0) {
    // Resolved score but the breakdown hasn't arrived yet — the detail view
    // auto-loads it, so this is a brief transitional state.
    const message = isEmailPriorityUnresolved(email)
      ? t('emailDetail.priorityPanel.noBreakdown')
      : t('emailDetail.priorityPanel.breakdownLoading');
    return (
      <div style={{ marginTop: theme.spacing.sm, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
        {message}
      </div>
    );
  }

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('emailDetail.scoreBreakdown').toUpperCase()}
      </div>
      {breakdown.map(item => (
        <div key={`${item.factor}-${item.value}`} style={breakdownRowStyle}>
          <span title={item.description} style={{ color: theme.colors.text.primary }}>
            {item.factor}
            {item.description && (
              <span style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                {item.description}
              </span>
            )}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontWeight: theme.typography.fontWeight.bold,
              color: item.value >= 0 ? theme.colors.accent.success : theme.colors.accent.error,
            }}
          >
            {item.value >= 0 ? '+' : ''}
            {item.value.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
};

export const EmailDetailPriorityPanel: React.FC<EmailDetailPriorityPanelProps> = ({
  email,
  priorityExplanation,
  onRecalculate,
  onNavigateToSettings,
  t,
}) => {
  return (
    <div style={panelStyle} data-testid="email-detail-priority-panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: theme.spacing.md,
          flexWrap: 'wrap',
        }}
      >
        <ScoreHeadline email={email} onRecalculate={onRecalculate} t={t} />
        {onNavigateToSettings && (
          <button
            type="button"
            onClick={onNavigateToSettings}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: theme.colors.primary.main,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {EMOJI_SETTINGS} {t('emailDetail.tweakRules')}
          </button>
        )}
      </div>
      <CategoryLine email={email} t={t} />
      <ScoreBreakdown priorityExplanation={priorityExplanation} email={email} t={t} />
    </div>
  );
};
