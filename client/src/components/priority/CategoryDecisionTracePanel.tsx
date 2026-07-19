import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import type {
  CategoryDecisionOutcome,
  CategoryDecisionStep,
  CategoryDecisionTrace,
} from './CategoryDebugModal.types';

// Defensive theme access (matches the surrounding debug components).
const SUCCESS_COLOR = theme.colors.success?.main ?? theme.colors.text.primary;
const WARN_COLOR =
  theme.colors.warning?.main ?? theme.colors.error?.main ?? theme.colors.text.primary;
const MUTED_COLOR = theme.colors.text.secondary;
const BORDER_COLOR =
  theme.colors.border?.light ??
  theme.colors.border?.default ??
  theme.colors.text.secondary;

interface CategoryDecisionTracePanelProps {
  trace: CategoryDecisionTrace | null | undefined;
  /** For resolving a step's categoryId to a display name. */
  emailCategories: Array<{ id: string; name: string }>;
}

const sectionStyle: React.CSSProperties = {
  marginBottom: theme.spacing.md,
  padding: theme.spacing.sm,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${BORDER_COLOR}`,
};

const headingStyle: React.CSSProperties = {
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.sm,
  marginBottom: theme.spacing.xs,
};

const stepRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: theme.spacing.xs,
  fontSize: theme.typography.fontSize.sm,
  padding: `${theme.spacing.xs} 0`,
  borderTop: `1px solid ${BORDER_COLOR}`,
};

const OUTCOME_APPLIED: CategoryDecisionOutcome = 'applied';
const OUTCOME_SUPPRESSED: CategoryDecisionOutcome = 'suppressed';

function outcomeColor(outcome: CategoryDecisionOutcome): string {
  if (outcome === OUTCOME_APPLIED) {
    return SUCCESS_COLOR;
  }
  if (outcome === OUTCOME_SUPPRESSED) {
    return WARN_COLOR;
  }
  return MUTED_COLOR;
}

/** Coloured badge for a step outcome (applied / considered / suppressed / skipped). */
const OutcomeBadge: React.FC<{ outcome: CategoryDecisionOutcome; label: string }> = ({
  outcome,
  label,
}) => (
  <span
    style={{
      fontSize: theme.typography.fontSize.xs,
      fontWeight: theme.typography.fontWeight.semibold,
      color: outcomeColor(outcome),
      textTransform: 'uppercase',
    }}
  >
    {label}
  </span>
);

/**
 * Renders the ordered category decision trace: every step that produced a
 * category candidate and whether it won, was considered, was suppressed (with
 * the reason), or skipped. This makes silent re-routes — e.g. the GitHub
 * "bot updates" override clobbering a confident local-model category — visible,
 * answering "what actually set the category?".
 */
export const CategoryDecisionTracePanel: React.FC<CategoryDecisionTracePanelProps> = ({
  trace,
  emailCategories,
}) => {
  const { t } = useTranslation();

  if (!trace || trace.steps.length === 0) {
    return (
      <div style={sectionStyle}>
        <div style={headingStyle}>{t('priority.categoryDebug.decisionTrace.title')}</div>
        <div style={{ fontSize: theme.typography.fontSize.sm, color: MUTED_COLOR }}>
          {t('priority.categoryDebug.decisionTrace.empty')}
        </div>
      </div>
    );
  }

  const finalName =
    emailCategories.find((category) => category.id === trace.finalCategoryId)?.name ??
    trace.finalCategory ??
    t('priority.categoryDebug.decisionTrace.other');

  const stepLabel = (step: CategoryDecisionStep): string =>
    t(`priority.categoryDebug.decisionTrace.steps.${step.step}`, {
      defaultValue: step.step,
    });

  const outcomeLabel = (outcome: CategoryDecisionOutcome): string =>
    t(`priority.categoryDebug.decisionTrace.outcomes.${outcome}`, {
      defaultValue: outcome,
    });

  const writtenByLabel = trace.writtenBy
    ? t(`priority.categoryDebug.decisionTrace.writtenByValues.${trace.writtenBy}`, {
        defaultValue: trace.writtenBy,
      })
    : null;
  const triggerLabel = trace.trigger
    ? t(`priority.categoryDebug.decisionTrace.triggerValues.${trace.trigger}`, {
        defaultValue: trace.trigger,
      })
    : null;
  const decidedAtLabel = trace.decidedAt ? new Date(trace.decidedAt).toLocaleString() : null;

  return (
    <div style={sectionStyle}>
      <div style={headingStyle}>{t('priority.categoryDebug.decisionTrace.title')}</div>

      {(writtenByLabel || triggerLabel || decidedAtLabel) && (
        <div style={{ ...stepRowStyle, color: MUTED_COLOR }}>
          {writtenByLabel && (
            <span>
              {t('priority.categoryDebug.decisionTrace.writtenBy', { defaultValue: 'Categorised by' })}:{' '}
              <strong>{writtenByLabel}</strong>
            </span>
          )}
          {triggerLabel && (
            <span>
              · {t('priority.categoryDebug.decisionTrace.trigger', { defaultValue: 'triggered by' })}{' '}
              {triggerLabel}
            </span>
          )}
          {decidedAtLabel && <span>· {decidedAtLabel}</span>}
        </div>
      )}

      {trace.analyzedEmail && (
        <div style={{ ...stepRowStyle, color: MUTED_COLOR }}>
          <span>
            {t('priority.categoryDebug.decisionTrace.analyzedEmail', {
              date: trace.analyzedEmail.receivedAt
                ? new Date(trace.analyzedEmail.receivedAt).toLocaleString()
                : t('priority.categoryDebug.decisionTrace.analyzedEmailUnknownDate'),
            })}
          </span>
          {trace.analyzedEmail.contentSource && (
            <span>
              ·{' '}
              {t(
                `priority.categoryDebug.decisionTrace.contentSources.${trace.analyzedEmail.contentSource}`,
                { defaultValue: trace.analyzedEmail.contentSource }
              )}
            </span>
          )}
          {trace.analyzedEmail.wasLatestInThread === false ? (
            <span style={{ color: WARN_COLOR, fontWeight: theme.typography.fontWeight.semibold, width: '100%' }}>
              {t('priority.categoryDebug.decisionTrace.analyzedEmailStale', {
                count: trace.analyzedEmail.threadEmailCount ?? 0,
              })}
            </span>
          ) : trace.analyzedEmail.wasLatestInThread === true && trace.analyzedEmail.threadEmailCount ? (
            <span>
              ·{' '}
              {t('priority.categoryDebug.decisionTrace.analyzedEmailWasLatest', {
                count: trace.analyzedEmail.threadEmailCount,
              })}
            </span>
          ) : null}
        </div>
      )}

      {trace.steps.map((step, index) => (
        // The trace is an append-only, never-reordered ordered list, so the
        // index is a stable unique key. Needed because the same step type can
        // legitimately repeat (e.g. github-override appended by the metadata
        // processor on top of an existing override step).
        // eslint-disable-next-line react/no-array-index-key
        <div key={`${step.step}:${step.outcome}:${index}`} style={stepRowStyle}>
          <span style={{ color: MUTED_COLOR, minWidth: 20 }}>{index + 1}.</span>
          <strong>{stepLabel(step)}</strong>
          <OutcomeBadge outcome={step.outcome} label={outcomeLabel(step.outcome)} />
          {step.category && <span>→ {step.category}</span>}
          <span style={{ color: MUTED_COLOR, width: '100%' }}>{step.detail}</span>
        </div>
      ))}

      <div style={{ ...stepRowStyle, fontWeight: theme.typography.fontWeight.semibold }}>
        <span style={{ color: MUTED_COLOR }}>
          {t('priority.categoryDebug.decisionTrace.final')}
        </span>
        <span style={{ color: SUCCESS_COLOR }}>{finalName}</span>
      </div>
    </div>
  );
};
