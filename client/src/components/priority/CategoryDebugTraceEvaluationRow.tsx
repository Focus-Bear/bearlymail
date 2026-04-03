import React from 'react';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

import type { CategoryRuleEvaluationDebug } from './CategoryDebugModal.types';

const monoStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: theme.typography.fontSize.xs,
  wordBreak: 'break-word',
};

function evaluationRuleLabel(ev: CategoryRuleEvaluationDebug, translate: TFunction): string {
  if (ev.ruleKind === CATEGORY_RULE_KIND_COMPOSITE) {
    return translate('priority.categoryDebug.traceRuleComposite');
  }
  return ev.ruleType ?? translate('priority.categoryDebug.traceRuleLegacyUnknown');
}

export interface CategoryDebugTraceEvaluationRowProps {
  evaluation: CategoryRuleEvaluationDebug;
  translate: TFunction;
}

export const CategoryDebugTraceEvaluationRow: React.FC<CategoryDebugTraceEvaluationRowProps> = ({
  evaluation: ev,
  translate,
}) => {
  const detail = ev.compositeDetail;

  return (
    <div style={{ marginBottom: theme.spacing.xs }}>
      <span style={monoStyle}>
        [{evaluationRuleLabel(ev, translate)}] {ev.categoryName}
      </span>
      {ev.isWinningRule && (
        <span style={{ color: theme.colors.primary.main, marginLeft: theme.spacing.xs }}>
          {translate('priority.categoryDebug.traceApplied')}
        </span>
      )}
      {!ev.isEnabled && (
        <span style={{ color: theme.colors.text.tertiary, marginLeft: theme.spacing.xs }}>
          {translate('priority.categoryDebug.traceDisabled')}
        </span>
      )}
      <br />
      {ev.ruleKind === CATEGORY_RULE_KIND_COMPOSITE && detail ? (
        <>
          <span style={{ color: theme.colors.text.secondary }}>{translate('priority.categoryDebug.traceCompositeSender')}:</span>{' '}
          <span style={monoStyle}>
            {detail.senderMatch
              ? translate('priority.categoryDebug.traceCompositeYes')
              : translate('priority.categoryDebug.traceCompositeNo')}
          </span>
          <br />
          <span style={{ color: theme.colors.text.secondary }}>{translate('priority.categoryDebug.traceCompositeSubject')}:</span>{' '}
          <span style={monoStyle}>
            {detail.subjectMatch
              ? translate('priority.categoryDebug.traceCompositeYes')
              : translate('priority.categoryDebug.traceCompositeNo')}
          </span>
          <br />
          <span style={{ color: theme.colors.text.secondary }}>{translate('priority.categoryDebug.traceCompositeBody')}:</span>{' '}
          <span style={monoStyle}>
            {detail.bodyMatch
              ? translate('priority.categoryDebug.traceCompositeYes')
              : translate('priority.categoryDebug.traceCompositeNo')}
          </span>
          {detail.bodyMatchedPhrase ? (
            <>
              <br />
              <span style={monoStyle}>
                {translate('priority.categoryDebug.traceCompositeMatchedPhrase', {
                  phrase: detail.bodyMatchedPhrase,
                })}
              </span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span style={{ color: theme.colors.text.secondary }}>{translate('priority.categoryDebug.tracePattern')}</span>{' '}
          <span style={monoStyle}>{ev.pattern}</span>
          {ev.subjectPrefix ? (
            <>
              <br />
              <span style={{ color: theme.colors.text.secondary }}>{translate('priority.categoryDebug.traceSubjectPrefix')}</span>{' '}
              <span style={monoStyle}>{ev.subjectPrefix}</span>
            </>
          ) : null}
        </>
      )}
      <br />
      <span style={{ color: theme.colors.text.tertiary }}>
        {ev.patternMatches
          ? translate('priority.categoryDebug.tracePatternMatches')
          : translate('priority.categoryDebug.tracePatternNoMatch')}
        {' · '}
        {translate('priority.categoryDebug.traceHits', { count: ev.hitCount })}
      </span>
    </div>
  );
};
