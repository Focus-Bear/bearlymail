import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

import type { CategorizationTrace } from './CategoryDebugModal.types';
import { CategoryDebugTraceEvaluationRow } from './CategoryDebugTraceEvaluationRow';

const sectionStyle: React.CSSProperties = {
  marginBottom: theme.spacing.md,
  padding: theme.spacing.sm,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.light}`,
};

function winningRuleTypeLabel(
  win: NonNullable<CategorizationTrace['deterministicRules']['winningRule']>,
  translate: TFunction
): string {
  if (win.ruleKind === CATEGORY_RULE_KIND_COMPOSITE) {
    return translate('priority.categoryDebug.traceRuleComposite');
  }
  return win.ruleType ?? translate('priority.categoryDebug.traceRuleLegacyUnknown');
}

interface CategoryDebugTracePanelProps {
  trace: CategorizationTrace;
}

export const CategoryDebugTracePanel: React.FC<CategoryDebugTracePanelProps> = ({ trace }) => {
  const { t: translate } = useTranslation();
  const { deterministicRules, shortlist, smartModel } = trace;
  const win = deterministicRules.winningRule;

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <h3 style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.base }}>
        {translate('priority.categoryDebug.traceTitle')}
      </h3>

      <div style={sectionStyle}>
        <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
          {translate('priority.categoryDebug.traceDeterministic')}
        </div>
        {win ? (
          <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.sm }}>
            {translate('priority.categoryDebug.traceWinner', {
              category: win.categoryName,
              type: winningRuleTypeLabel(win, translate),
            })}
          </p>
        ) : (
          <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.sm }}>
            {translate('priority.categoryDebug.traceNoRuleMatch')}
          </p>
        )}
        <ul style={{ margin: 0, paddingLeft: theme.spacing.md, fontSize: theme.typography.fontSize.xs }}>
          {deterministicRules.evaluations.map(evaluation => (
            <CategoryDebugTraceEvaluationRow key={evaluation.id} evaluation={evaluation} translate={translate} />
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
          {translate('priority.categoryDebug.traceShortlist')}
        </div>
        {shortlist.error ? (
          <p style={{ color: theme.colors.feedback?.error || '#c62828', fontSize: theme.typography.fontSize.sm }}>
            {shortlist.error}
          </p>
        ) : null}
        {shortlist.skipped && shortlist.skipReason ? (
          <p style={{ fontSize: theme.typography.fontSize.sm, marginTop: 0 }}>{shortlist.skipReason}</p>
        ) : null}
        <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: 0 }}>
          {shortlist.categoryNames.length > 0 ? shortlist.categoryNames.join(', ') : translate('priority.categoryDebug.traceEmpty')}
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
          {translate('priority.categoryDebug.traceSmartModel')}
        </div>
        {smartModel.error ? (
          <p style={{ color: theme.colors.feedback?.error || '#c62828', fontSize: theme.typography.fontSize.sm }}>
            {smartModel.error}
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm }}>
              <strong>{translate('priority.categoryDebug.category')}:</strong>{' '}
              {smartModel.category || translate('priority.categoryDebug.none')}
            </p>
            {smartModel.categoryConfidence ? (
              <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs }}>
                {translate('priority.categoryDebug.traceConfidence')}: {smartModel.categoryConfidence}
              </p>
            ) : null}
            {smartModel.categoryExplanation ? (
              <p style={{ margin: `${theme.spacing.xs} 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                {smartModel.categoryExplanation}
              </p>
            ) : null}
          </>
        )}
      </div>

      <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, margin: 0 }}>
        {translate('priority.categoryDebug.traceFootnote')}
      </p>
    </div>
  );
};
