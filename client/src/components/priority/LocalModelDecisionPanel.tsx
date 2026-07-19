import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import type { LocalModelDebugSnapshot } from './CategoryDebugModal.types';

const DECIDED_BY_LOCAL: LocalModelDebugSnapshot['decidedBy'] = 'local';

// Defensive theme access (matches the surrounding debug components): fall back
// to always-present tokens if the semantic colour shape ever changes.
const SUCCESS_COLOR = theme.colors.success?.main ?? theme.colors.text.primary;
const DIFFER_COLOR = theme.colors.error?.main ?? theme.colors.text.primary;
const BORDER_COLOR =
  theme.colors.border?.light ??
  theme.colors.border?.default ??
  theme.colors.text.secondary;

interface LocalModelDecisionPanelProps {
  localModelDebug: LocalModelDebugSnapshot | null | undefined;
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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: theme.spacing.xs,
  fontSize: theme.typography.fontSize.sm,
  padding: `${theme.spacing.xs} 0`,
};

const labelStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  minWidth: 72,
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Coloured agree / disagree chip. */
const AgreementChip: React.FC<{ agree: boolean; translate: TFunction }> = ({
  agree,
  translate,
}) => (
  <span
    style={{
      fontSize: theme.typography.fontSize.xs,
      fontWeight: theme.typography.fontWeight.semibold,
      color: agree ? SUCCESS_COLOR : DIFFER_COLOR,
    }}
  >
    {agree
      ? translate('priority.categoryDebug.localModel.agree')
      : translate('priority.categoryDebug.localModel.disagree')}
  </span>
);

/** One "Local: X  ·  LLM: Y  ·  agree/disagree" comparison row, with the local
 * model's confidence and whether it fell back to the LLM. */
const ComparisonRow: React.FC<{
  label: string;
  local: string;
  confidence: number;
  fellBack: boolean;
  llm: string | null;
  agree: boolean;
  translate: TFunction;
}> = ({ label, local, confidence, fellBack, llm, agree, translate }) => (
  <div style={rowStyle}>
    <span style={labelStyle}>{label}</span>
    <span>
      {translate('priority.categoryDebug.localModel.local')}: <strong>{local}</strong> (
      {pct(confidence)})
    </span>
    {fellBack && (
      <span style={{ color: theme.colors.text.secondary }}>
        {translate('priority.categoryDebug.localModel.belowThreshold')}
      </span>
    )}
    <span style={{ color: theme.colors.text.secondary }}>
      {translate('priority.categoryDebug.localModel.llm')}: <strong>{llm ?? '—'}</strong>
    </span>
    <AgreementChip agree={agree} translate={translate} />
  </div>
);

/**
 * Shows which model decided this thread's category/priority and how the local
 * model's prediction compares to the LLM's. Renders a muted note when the local
 * model hasn't scored the thread yet (no bundle, cold start, or shadow off).
 */
export const LocalModelDecisionPanel: React.FC<LocalModelDecisionPanelProps> = ({
  localModelDebug,
}) => {
  const { t } = useTranslation();

  if (!localModelDebug) {
    return (
      <div style={sectionStyle}>
        <div style={headingStyle}>{t('priority.categoryDebug.localModel.title')}</div>
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('priority.categoryDebug.localModel.notScored')}
        </div>
      </div>
    );
  }

  const decidedByLocal = localModelDebug.decidedBy === DECIDED_BY_LOCAL;
  return (
    <div style={sectionStyle}>
      <div style={headingStyle}>{t('priority.categoryDebug.localModel.title')}</div>

      <div style={rowStyle}>
        <span style={labelStyle}>
          {t('priority.categoryDebug.localModel.decidedBy')}
        </span>
        <span
          style={{
            fontWeight: theme.typography.fontWeight.semibold,
            color: decidedByLocal
              ? SUCCESS_COLOR
            : theme.colors.text.primary,
          }}
        >
          {decidedByLocal
            ? t('priority.categoryDebug.localModel.decidedByLocal')
            : t('priority.categoryDebug.localModel.decidedByLlm')}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>{t('priority.categoryDebug.localModel.family')}</span>
        <span>
          <strong>{localModelDebug.family}</strong> ({pct(localModelDebug.familyConfidence)})
        </span>
        {localModelDebug.familyFallback && (
          <span style={{ color: theme.colors.text.secondary }}>
            {t('priority.categoryDebug.localModel.belowThreshold')}
          </span>
        )}
      </div>

      <ComparisonRow
        label={t('priority.categoryDebug.localModel.category')}
        local={localModelDebug.category}
        confidence={localModelDebug.categoryConfidence}
        fellBack={localModelDebug.categoryFallback}
        llm={localModelDebug.llmCategory}
        agree={localModelDebug.categoryAgree}
        translate={t}
      />

      <ComparisonRow
        label={t('priority.categoryDebug.localModel.priority')}
        local={localModelDebug.priorityBand}
        confidence={localModelDebug.priorityConfidence}
        fellBack={localModelDebug.priorityFallback}
        llm={localModelDebug.llmPriorityBand}
        agree={localModelDebug.priorityAgree}
        translate={t}
      />
    </div>
  );
};
