import { TFunction } from 'i18next';

import { WorkflowCondition } from './types';

export type CategoryNamesById = Record<string, string>;

const PATTERNS_SHOWN = 2;
const CATEGORY_NAME_SEPARATOR = ', ';

const CONDITION_LABEL_KEYS = [
  ['fromPatterns', 'settings.workflows.list.conditionFrom'],
  ['subjectPatterns', 'settings.workflows.list.conditionSubject'],
  ['bodyPatterns', 'settings.workflows.list.conditionBody'],
] as const;

/**
 * The category names a category-scoped workflow runs on, or null when it isn't
 * category-scoped. An id with no name (a deleted category, or names still
 * loading) reads as "a specific category" rather than leaking the raw id.
 */
export function describeCategoryScope(
  condition: WorkflowCondition,
  categoryNamesById: CategoryNamesById,
  translate: TFunction
): string | null {
  const categoryIds = condition.categories ?? [];
  if (categoryIds.length === 0) {
    return null;
  }
  const names = categoryIds.map(id => categoryNamesById[id]).filter((name): name is string => Boolean(name));
  return names.length > 0
    ? names.join(CATEGORY_NAME_SEPARATOR)
    : translate('settings.workflows.list.unknownCategory');
}

/**
 * One-line summary of what a workflow matches, for the workflows list. A rule
 * scoped only to a category says "Any email in <category>", never the bare
 * "Matches any email" that made it sound like it archived everything.
 */
export function describeWorkflowCondition(
  condition: WorkflowCondition,
  categoryNamesById: CategoryNamesById,
  translate: TFunction
): string {
  const patternParts = CONDITION_LABEL_KEYS.flatMap(([field, labelKey]) => {
    const patterns = condition[field] ?? [];
    return patterns.length > 0 ? [translate(labelKey, { value: patterns.slice(0, PATTERNS_SHOWN).join(', ') })] : [];
  });
  const aiPart = condition.naturalLanguageCondition
    ? [translate('settings.workflows.list.conditionAi', { value: condition.naturalLanguageCondition })]
    : [];
  const otherParts = [...patternParts, ...aiPart];
  const category = describeCategoryScope(condition, categoryNamesById, translate);

  if (category) {
    return otherParts.length > 0
      ? [translate('settings.workflows.list.conditionInCategory', { category }), ...otherParts].join('; ')
      : translate('settings.workflows.list.conditionCategory', { category });
  }
  return otherParts.length > 0 ? otherParts.join('; ') : translate('settings.workflows.list.conditionAny');
}
