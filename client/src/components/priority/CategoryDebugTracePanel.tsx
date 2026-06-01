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

interface TraceStaleReplyWarningProps {
  evaluatedEmail: CategorizationTrace['evaluatedEmail'] | undefined;
  translate: TFunction;
}

/**
 * Warns when the rules were evaluated against an email that is not the latest
 * reply in its thread, since the stored thread category may have been computed
 * from a different message (a later reply can flip a NOT-contains exclusion).
 */
const TraceStaleReplyWarning: React.FC<TraceStaleReplyWarningProps> = ({ evaluatedEmail, translate }) => {
  if (!evaluatedEmail || evaluatedEmail.isLatestInThread) {
    return null;
  }
  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.warning?.light || '#fff4e5',
        border: `1px solid ${theme.colors.warning?.main || '#ed6c02'}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
      }}
    >
      {translate('priority.categoryDebug.traceNotLatestReplyWarning', {
        count: evaluatedEmail.threadEmailCount,
        latestDate: formatTraceDate(evaluatedEmail.latestReceivedAt),
        evaluatedDate: formatTraceDate(evaluatedEmail.evaluatedReceivedAt),
      })}
    </div>
  );
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
  /** Shortlist that was passed to the smart model during the ORIGINAL decision. */
  storedShortlist: string[] | null;
  translate: TFunction;
}

/** Returns items in `source` that are not in `excluded` (case-insensitive). */
function diffNames(source: string[], excluded: string[]): string[] {
  const excludedLower = new Set(excluded.map(name => name.toLowerCase()));
  return source.filter(name => !excludedLower.has(name.toLowerCase()));
}

interface TraceShortlistRemovedListProps {
  removed: string[];
  translate: TFunction;
}

const TraceShortlistRemovedList: React.FC<TraceShortlistRemovedListProps> = ({ removed, translate }) => (
  <div style={{ marginTop: theme.spacing.sm, fontSize: theme.typography.fontSize.xs }}>
    <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}>
      {translate('priority.categoryDebug.traceShortlistRemovedLabel')}
    </div>
    <ul
      style={{
        margin: 0,
        paddingLeft: theme.spacing.lg,
        color: theme.colors.text.tertiary,
      }}
    >
      {removed.map(name => (
        <li key={name} style={{ marginBottom: 2 }}>
          {name}
        </li>
      ))}
    </ul>
  </div>
);

const TraceShortlistSection: React.FC<TraceShortlistSectionProps> = ({
  winningRule,
  shortlist,
  storedShortlist,
  translate,
}) => {
  // Show the shortlisted categories whenever the shortlist actually ran (not skipped) and
  // produced names — even when a deterministic rule won. The rule overrides the final
  // category, but the shortlist still runs inside the priority prompt, so hiding it here
  // made the trace look like nothing was shortlisted. The intro paragraph clarifies that
  // the rule (not the shortlist) determined the final category.
  const showOrderedList = !shortlist.skipped && shortlist.categoryNames.length > 0;
  const fallbackText = shortlistFallbackParagraph(shortlist, translate);

  // Compute the diff vs. the shortlist the original decision saw. Null means
  // nothing was stored (older threads or a thread never analysed), so we don't
  // render a comparison at all.
  const hasStoredComparison = storedShortlist !== null && storedShortlist !== undefined;
  const storedNames = storedShortlist ?? [];
  const newlyShortlistedSet = new Set(
    diffNames(shortlist.categoryNames, storedNames).map(name => name.toLowerCase()),
  );
  const removedFromOriginal = diffNames(storedNames, shortlist.categoryNames);

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
      {showOrderedList && hasStoredComparison ? (
        <p
          style={{
            margin: `0 0 ${theme.spacing.xs} 0`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
          }}
        >
          {translate('priority.categoryDebug.traceShortlistDiffSummary', {
            newCount: newlyShortlistedSet.size,
            removedCount: removedFromOriginal.length,
          })}
        </p>
      ) : null}
      {showOrderedList ? (
        <ol
          style={{
            margin: `${theme.spacing.xs} 0 0`,
            paddingLeft: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {shortlist.categoryNames.map(name => {
            const isNew = newlyShortlistedSet.has(name.toLowerCase());
            return (
              <li key={name} style={{ marginBottom: theme.spacing.xs }}>
                {name}
                {hasStoredComparison && isNew ? (
                  <span
                    title={translate('priority.categoryDebug.traceShortlistNewTooltip')}
                    style={{
                      marginLeft: theme.spacing.xs,
                      color: theme.colors.primary.main,
                      fontWeight: theme.typography.fontWeight.semibold,
                    }}
                  >
                    {translate('priority.categoryDebug.traceShortlistNewMarker')}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: 0 }}>
          {fallbackText}
        </p>
      )}
      {hasStoredComparison && removedFromOriginal.length > 0 ? (
        <TraceShortlistRemovedList removed={removedFromOriginal} translate={translate} />
      ) : null}
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
  /**
   * The shortlist that was passed to the smart model during the ORIGINAL
   * decision (`thread.shortlistedCategoryNames`). The shortlist section uses
   * it to mark which live-shortlist items are new vs. the original, so the
   * user can see why the original decision may differ. `null` means we have
   * no record of the original shortlist and the comparison is skipped.
   */
  storedShortlist?: string[] | null;
}

export const CategoryDebugTracePanel: React.FC<CategoryDebugTracePanelProps> = ({
  trace,
  storedShortlist = null,
}) => {
  const { t: translate } = useTranslation();
  const { deterministicRules, shortlist, smartModel, evaluatedEmail } = trace;

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

      <TraceStaleReplyWarning evaluatedEmail={evaluatedEmail} translate={translate} />

      <DeterministicRulesSection
        winningRule={deterministicRules.winningRule}
        evaluations={deterministicRules.evaluations}
        translate={translate}
      />
      <TraceShortlistSection
        winningRule={deterministicRules.winningRule}
        shortlist={shortlist}
        storedShortlist={storedShortlist}
        translate={translate}
      />
      <TraceFinalDecisionSection smartModel={smartModel} translate={translate} />

      <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, margin: 0 }}>
        {translate('priority.categoryDebug.traceFootnote')}
      </p>
    </div>
  );
};
