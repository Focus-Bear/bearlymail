import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

import type { CategorizationTrace, CategoryRuleEvaluationDebug } from './CategoryDebugModal.types';
import { CategoryDebugTraceEvaluationRow } from './CategoryDebugTraceEvaluationRow';

const sectionStyle: React.CSSProperties = {
  marginBottom: theme.spacing.md,
  padding: theme.spacing.sm,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.light}`,
};

const summaryBaseStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.sm,
  padding: `${theme.spacing.xs} 0`,
  listStyle: 'none',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: theme.spacing.xs,
  userSelect: 'none',
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

function evaluationRuleTypeLabel(ev: CategoryRuleEvaluationDebug, translate: TFunction): string {
  if (ev.ruleKind === CATEGORY_RULE_KIND_COMPOSITE) {
    return translate('priority.categoryDebug.traceRuleComposite');
  }
  return ev.ruleType ?? translate('priority.categoryDebug.traceRuleLegacyUnknown');
}

function ruleStatusLabel(ev: CategoryRuleEvaluationDebug, translate: TFunction): string {
  if (ev.isWinningRule) {
    return translate('priority.categoryDebug.traceRuleStatusWinner');
  }
  if (ev.isEnabled && ev.patternMatches) {
    return translate('priority.categoryDebug.traceRuleStatusFlagged');
  }
  if (!ev.isEnabled && ev.patternMatches) {
    return translate('priority.categoryDebug.traceRuleStatusDisabledButWouldMatch');
  }
  return translate('priority.categoryDebug.traceRuleStatusNoMatch');
}

function ruleStatusAccentColor(evaluation: CategoryRuleEvaluationDebug): string {
  if (evaluation.isWinningRule) {
    return theme.colors.primary.main;
  }
  if (evaluation.isEnabled && evaluation.patternMatches) {
    return theme.colors.feedback?.success || '#2e7d32';
  }
  return theme.colors.text.tertiary;
}

function sortRuleEvaluations(evaluations: CategoryRuleEvaluationDebug[]): CategoryRuleEvaluationDebug[] {
  return [...evaluations].sort((left, right) => {
    if (left.isWinningRule !== right.isWinningRule) {
      return left.isWinningRule ? -1 : 1;
    }
    const leftFlag = left.isEnabled && left.patternMatches;
    const rightFlag = right.isEnabled && right.patternMatches;
    if (leftFlag !== rightFlag) {
      return leftFlag ? -1 : 1;
    }
    if (left.patternMatches !== right.patternMatches) {
      return left.patternMatches ? -1 : 1;
    }
    return 0;
  });
}

function shortlistFallbackParagraph(
  shortlist: CategorizationTrace['shortlist'],
  translate: TFunction
): string {
  if (shortlist.categoryNames.length > 0) {
    return shortlist.categoryNames.join(', ');
  }
  return translate('priority.categoryDebug.traceEmpty');
}

interface TraceRuleAccordionItemProps {
  evaluation: CategoryRuleEvaluationDebug;
  translate: TFunction;
}

const TraceRuleAccordionItem: React.FC<TraceRuleAccordionItemProps> = ({ evaluation, translate }) => (
  <details
    style={{
      border: `1px solid ${theme.colors.border?.default || '#e8e8e8'}`,
      borderRadius: theme.borderRadius.sm,
      padding: `0 ${theme.spacing.sm}`,
      backgroundColor: theme.colors.background.default,
    }}
  >
    <summary style={summaryBaseStyle}>
      <span>{evaluation.categoryName}</span>
      <span style={{ color: theme.colors.text.secondary, fontWeight: theme.typography.fontWeight.normal }}>
        ({evaluationRuleTypeLabel(evaluation, translate)})
      </span>
      <span
        style={{
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: ruleStatusAccentColor(evaluation),
        }}
      >
        {ruleStatusLabel(evaluation, translate)}
      </span>
    </summary>
    <div style={{ paddingBottom: theme.spacing.sm, paddingLeft: theme.spacing.xs }}>
      <CategoryDebugTraceEvaluationRow evaluation={evaluation} translate={translate} />
    </div>
  </details>
);

interface TraceShortlistSectionProps {
  winningRule: CategorizationTrace['deterministicRules']['winningRule'];
  shortlist: CategorizationTrace['shortlist'];
  translate: TFunction;
}

const TraceShortlistSection: React.FC<TraceShortlistSectionProps> = ({ winningRule, shortlist, translate }) => {
  // Show the shortlisted categories whenever the shortlist actually ran (not skipped) and
  // produced names — even when a deterministic rule won. The rule overrides the final
  // category, but the shortlist still runs inside the priority prompt, so hiding it here
  // made the trace look like nothing was shortlisted. The intro paragraph clarifies that
  // the rule (not the shortlist) determined the final category.
  const showOrderedList = !shortlist.skipped && shortlist.categoryNames.length > 0;
  const fallbackText = shortlistFallbackParagraph(shortlist, translate);

  return (
    <div style={sectionStyle}>
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
        {translate('priority.categoryDebug.traceShortlist')}
      </div>
      <p
        style={{
          margin: `0 0 ${theme.spacing.xs} 0`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
        }}
      >
        {winningRule
          ? translate('priority.categoryDebug.traceShortlistAfterRule')
          : translate('priority.categoryDebug.traceShortlistNoRule')}
      </p>
      {shortlist.error ? (
        <p style={{ color: theme.colors.feedback?.error || '#c62828', fontSize: theme.typography.fontSize.sm }}>
          {shortlist.error}
        </p>
      ) : null}
      {shortlist.skipped && shortlist.skipReason ? (
        <p style={{ fontSize: theme.typography.fontSize.sm, marginTop: 0 }}>{shortlist.skipReason}</p>
      ) : null}
      {showOrderedList ? (
        <ol
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            paddingLeft: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {shortlist.categoryNames.map(name => (
            <li key={name} style={{ marginBottom: theme.spacing.xs }}>
              {name}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: 0 }}>
          {fallbackText}
        </p>
      )}
    </div>
  );
};

interface TraceFinalDecisionSectionProps {
  smartModel: CategorizationTrace['smartModel'];
  translate: TFunction;
}

const TraceFinalDecisionSection: React.FC<TraceFinalDecisionSectionProps> = ({ smartModel, translate }) => (
  <div style={sectionStyle}>
    <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
      {translate('priority.categoryDebug.traceFinalDecision')}
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
          <p
            style={{
              margin: `${theme.spacing.xs} 0 0`,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
          >
            {smartModel.categoryExplanation}
          </p>
        ) : null}
        {smartModel.llmCategoryBeforeRuleOverride !== undefined ? (
          <div
            style={{
              marginTop: theme.spacing.sm,
              padding: theme.spacing.xs,
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
          >
            <strong>{translate('priority.categoryDebug.traceLlmBeforeRuleOverride')}</strong>
            <div style={{ marginTop: 4 }}>
              {translate('priority.categoryDebug.traceLlmCategoryRaw')}:{' '}
              {smartModel.llmCategoryBeforeRuleOverride || translate('priority.categoryDebug.none')}
            </div>
            {smartModel.llmExplanationBeforeRuleOverride ? (
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {smartModel.llmExplanationBeforeRuleOverride}
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    )}
  </div>
);

interface DeterministicRulesSectionProps {
  winningRule: CategorizationTrace['deterministicRules']['winningRule'];
  evaluations: CategoryRuleEvaluationDebug[];
  translate: TFunction;
}

const DeterministicRulesSection: React.FC<DeterministicRulesSectionProps> = ({
  winningRule,
  evaluations,
  translate,
}) => {
  const sortedEvaluations = useMemo(() => sortRuleEvaluations(evaluations), [evaluations]);

  return (
    <div style={sectionStyle}>
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
        {translate('priority.categoryDebug.traceDeterministic')}
      </div>
      {winningRule ? (
        <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.sm }}>
          {translate('priority.categoryDebug.traceWinner', {
            category: winningRule.categoryName,
            type: winningRuleTypeLabel(winningRule, translate),
          })}
        </p>
      ) : (
        <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.sm }}>
          {translate('priority.categoryDebug.traceNoRuleMatch')}
        </p>
      )}
      <p
        style={{
          margin: `0 0 ${theme.spacing.xs} 0`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {translate('priority.categoryDebug.traceRulesAccordionHint')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        {sortedEvaluations.map(evaluation => (
          <TraceRuleAccordionItem key={evaluation.id} evaluation={evaluation} translate={translate} />
        ))}
      </div>
    </div>
  );
};

interface CategoryDebugTracePanelProps {
  trace: CategorizationTrace;
}

export const CategoryDebugTracePanel: React.FC<CategoryDebugTracePanelProps> = ({ trace }) => {
  const { t: translate } = useTranslation();
  const { deterministicRules, shortlist, smartModel } = trace;

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <h3 style={{ margin: `0 0 ${theme.spacing.sm} 0`, fontSize: theme.typography.fontSize.base }}>
        {translate('priority.categoryDebug.traceTitle')}
      </h3>
      <p
        style={{
          margin: `0 0 ${theme.spacing.sm} 0`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
        }}
      >
        {translate('priority.categoryDebug.traceIntro')}
      </p>

      <DeterministicRulesSection
        winningRule={deterministicRules.winningRule}
        evaluations={deterministicRules.evaluations}
        translate={translate}
      />
      <TraceShortlistSection winningRule={deterministicRules.winningRule} shortlist={shortlist} translate={translate} />
      <TraceFinalDecisionSection smartModel={smartModel} translate={translate} />

      <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, margin: 0 }}>
        {translate('priority.categoryDebug.traceFootnote')}
      </p>
    </div>
  );
};
