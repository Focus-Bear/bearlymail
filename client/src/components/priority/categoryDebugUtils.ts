import { CATEGORY_RULE_KIND_COMPOSITE } from 'constants/category-rules';

import { CategoryDebugData } from './CategoryDebugModal.types';

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

function appendCategorySection(lines: string[], thread: CategoryDebugData['thread']): void {
  lines.push('### Current Category', `- **Category**: ${thread.category ?? 'None'}`);
  if (thread.categorySource) {
    lines.push(`- **Set by step**: ${thread.categorySource}`);
  }
  if (thread.categoryExplanation) {
    lines.push(`- **Explanation**: ${thread.categoryExplanation}`);
  }
  const snapshot = thread.categoryRuleTrace;
  if (snapshot) {
    const winner = snapshot.winningRuleId
      ? `${snapshot.winningRuleCategoryName ?? '?'} (rule ${snapshot.winningRuleId})`
      : 'none';
    const matchedNotWinning =
      snapshot.matchedButNotWinningRuleIds.length > 0
        ? snapshot.matchedButNotWinningRuleIds.join(', ')
        : '—';
    lines.push(
      `- **Rule trace (processing time)**: ${snapshot.evaluatedAt} | rulesConsidered=${snapshot.rulesConsideredCount} winner=${winner} matchedButNotApplied=[${matchedNotWinning}]`
    );
  } else {
    lines.push('- **Rule trace (processing time)**: none recorded');
  }
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
export const formatForGithubIssue = (debugInfo: CategoryDebugData): string => {
  const lines: string[] = ['## Category Debug Report', ''];
  appendEmailSection(lines, debugInfo.email);
  appendCategorySection(lines, debugInfo.thread);
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
