import { categoryRuleSettingsPath } from 'utils/categoryRuleLinks';

import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

import {
  CategoryDebugData,
  CategoryRuleTraceSnapshot,
  CURRENT_RULE_RECORDED_BY,
  CurrentCategoryRule,
  RULE_CATEGORY_SOURCE,
} from './CategoryDebugModal.types';

// Pure section builders for GitHub issue formatting.

function appendEmailSection(lines: string[], email: CategoryDebugData['email']): void {
  const fromDisplay = email.fromName ? `${email.fromName} <${email.from}>` : email.from;
  lines.push('### Email', `- **From**: ${fromDisplay}`);
  if (email.senderJobTitle) {
    lines.push(`- **Job Title**: ${email.senderJobTitle}`);
  }
  lines.push(`- **Subject**: ${email.subject}`);
  if (email.bodyPreview) {
    lines.push('- **Body Preview**:', '  ```', `  ${email.bodyPreview.replace(/\n/g, '\n  ')}`, '  ```');
  }
  lines.push('');
}

/** The rule behind the current category, with a link that opens it in Settings. */
function currentRuleLine(rule: CurrentCategoryRule | null, appOrigin: string): string {
  if (!rule) {
    return '- **Rule that set this category**: not recorded, and no rule matches the newest email into this category now';
  }
  const name = rule.categoryName ?? 'rule since deleted';
  const liveMatchNote =
    rule.recordedBy === CURRENT_RULE_RECORDED_BY.LIVE_MATCH
      ? ' (ID not recorded when this was set; this is the rule that matches the newest email now)'
      : '';
  return `- **Rule that set this category**: ${name} (rule ${rule.ruleId})${liveMatchNote} — ${appOrigin}${categoryRuleSettingsPath(rule.ruleId)}`;
}

/**
 * The rule-step snapshot is only rewritten by paths that re-run the full rule
 * trace, so it can describe a decision made weeks before the current one.
 */
function historicalTraceLine(
  snapshot: CategoryRuleTraceSnapshot | null | undefined,
  currentRuleId: string | null
): string {
  if (!snapshot) {
    return '- **Rule trace (historical, from processing time)**: none recorded';
  }
  const winner = snapshot.winningRuleId
    ? `${snapshot.winningRuleCategoryName ?? '?'} (rule ${snapshot.winningRuleId})`
    : 'none';
  const matchedNotWinning =
    snapshot.matchedButNotWinningRuleIds.length > 0 ? snapshot.matchedButNotWinningRuleIds.join(', ') : '—';
  const differsNote =
    currentRuleId && snapshot.winningRuleId && snapshot.winningRuleId !== currentRuleId
      ? ' — a different rule from the one that set the current category'
      : '';
  return `- **Rule trace (historical, from processing time ${snapshot.evaluatedAt})**: rulesConsidered=${snapshot.rulesConsideredCount} winner=${winner} matchedButNotApplied=[${matchedNotWinning}]${differsNote}`;
}

function appendCategorySection(lines: string[], thread: CategoryDebugData['thread'], appOrigin: string): void {
  lines.push('### Current Category', `- **Category**: ${thread.category ?? 'None'}`);
  if (thread.categorySource) {
    lines.push(`- **Set by step**: ${thread.categorySource}`);
  }
  if (thread.categoryExplanation) {
    lines.push(`- **Explanation**: ${thread.categoryExplanation}`);
  }
  const currentRule = thread.currentRule ?? null;
  if (thread.categorySource === RULE_CATEGORY_SOURCE) {
    lines.push(currentRuleLine(currentRule, appOrigin));
  }
  lines.push(historicalTraceLine(thread.categoryRuleTrace, currentRule?.ruleId ?? null));
  lines.push('');
}

function appendCategoriesList(lines: string[], categories: CategoryDebugData['emailCategories'], header: string): void {
  lines.push(header);
  if (categories.length === 0) {
    lines.push('None');
  } else {
    categories.forEach(cat => {
      const keyPart = cat.categoryKey ? ` [key: ${cat.categoryKey}]` : '';
      lines.push(`- **${cat.name}** (context ${cat.id})${keyPart}${cat.description ? `: ${cat.description}` : ''}`);
    });
  }
  lines.push('');
}

function appendContextItemList(
  lines: string[],
  label: string,
  items: Array<{ value: string; explanation?: string; priority?: number }>
): void {
  if (items.length === 0) {
    return;
  }
  lines.push(`**${label}:**`);
  items.forEach(item => {
    let extra = '';
    if (item.explanation) {
      extra = ` (${item.explanation})`;
    } else if (item.priority !== undefined) {
      extra = ` (priority ${item.priority})`;
    }
    lines.push(`- ${item.value}${extra}`);
  });
}

// eslint-disable-next-line max-statements -- pre-existing: helper function aggregates data from multiple sources
export const formatForGithubIssue = (debugInfo: CategoryDebugData, appOrigin: string): string => {
  const lines: string[] = ['## Category Debug Report', ''];
  appendEmailSection(lines, debugInfo.email);
  appendCategorySection(lines, debugInfo.thread, appOrigin);
  appendCategoriesList(
    lines,
    debugInfo.emailCategories,
    `### Available Categories (${debugInfo.emailCategories.length})`
  );
  if (debugInfo.protoCategories.length > 0) {
    appendCategoriesList(
      lines,
      debugInfo.protoCategories,
      `### Proto Categories (${debugInfo.protoCategories.length})`
    );
  }
  lines.push('### User Context');
  const { urgentItems, notUrgentItems, goals, workingOn, dontCare } = debugInfo.userContext;
  appendContextItemList(lines, 'Urgent Items', urgentItems);
  appendContextItemList(lines, 'Not Urgent Items', notUrgentItems);
  appendContextItemList(lines, 'Goals', goals);
  appendContextItemList(lines, 'Working On', workingOn);
  appendContextItemList(lines, "Don't Care", dontCare);
  if (!urgentItems.length && !notUrgentItems.length && !goals.length && !workingOn.length && !dontCare.length) {
    lines.push('None');
  }
  if (debugInfo.categorizationTrace) {
    const tr = debugInfo.categorizationTrace;
    lines.push('');
    lines.push('### Categorisation trace (deep refresh)');
    const win = tr.deterministicRules.winningRule;
    let winLabel: string | null = null;
    if (win) {
      if (win.ruleKind === CATEGORY_RULE_KIND_COMPOSITE) {
        winLabel = CATEGORY_RULE_KIND_COMPOSITE;
      } else {
        winLabel = win.ruleType ?? 'legacy';
      }
    }
    lines.push(
      win
        ? `- **Deterministic winner**: ${win.categoryName} (${winLabel}, id ${win.ruleId})`
        : '- **Deterministic winner**: none'
    );
    lines.push('- **Rule evaluations**:');
    tr.deterministicRules.evaluations.forEach(evaluation => {
      const kindLabel =
        evaluation.ruleKind === CATEGORY_RULE_KIND_COMPOSITE
          ? CATEGORY_RULE_KIND_COMPOSITE
          : (evaluation.ruleType ?? 'legacy');
      let extra = '';
      if (evaluation.ruleKind === CATEGORY_RULE_KIND_COMPOSITE && evaluation.compositeDetail) {
        const compositeDetail = evaluation.compositeDetail;
        const matchedSender = compositeDetail.senderMatchedValue
          ? ` matchedSender=${compositeDetail.senderMatchedValue}`
          : '';
        const matchedSubject = compositeDetail.subjectMatchedValue
          ? ` matchedSubject=${compositeDetail.subjectMatchedValue}`
          : '';
        extra = ` | sender=${compositeDetail.senderMatch}${matchedSender} subject=${compositeDetail.subjectMatch}${matchedSubject} body=${compositeDetail.bodyMatch} phrase=${compositeDetail.bodyMatchedPhrase ?? '—'}`;
      }
      lines.push(
        `  - [${kindLabel}] ${evaluation.categoryName} | patternMatch=${evaluation.patternMatches} enabled=${evaluation.isEnabled} winning=${evaluation.isWinningRule} hits=${evaluation.hitCount}${extra}`
      );
    });
    lines.push(`- **Shortlist skipped**: ${tr.shortlist.skipped}`);
    if (tr.shortlist.skipReason) {
      lines.push(`  - ${tr.shortlist.skipReason}`);
    }
    if (tr.shortlist.error) {
      lines.push(`- **Shortlist error**: ${tr.shortlist.error}`);
    }
    lines.push(`- **Shortlist categories**: ${tr.shortlist.categoryNames.join(', ') || '(none)'}`);
    if (tr.smartModel.error) {
      lines.push(`- **Smart model error**: ${tr.smartModel.error}`);
    } else {
      lines.push(`- **Final category (priority pipeline)**: ${tr.smartModel.category}`);
      lines.push(`- **Final explanation**: ${tr.smartModel.categoryExplanation}`);
      if (tr.smartModel.categoryConfidence) {
        lines.push(`- **Smart model confidence**: ${tr.smartModel.categoryConfidence}`);
      }
      if (tr.smartModel.llmCategoryBeforeRuleOverride !== undefined) {
        lines.push(`- **LLM category before rule override**: ${tr.smartModel.llmCategoryBeforeRuleOverride || 'None'}`);
        if (tr.smartModel.llmExplanationBeforeRuleOverride) {
          lines.push(`  - ${tr.smartModel.llmExplanationBeforeRuleOverride}`);
        }
      }
    }
  }
  return lines.join('\n');
};
