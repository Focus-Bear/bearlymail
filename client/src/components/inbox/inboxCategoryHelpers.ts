/**
 * Pure computation helpers for inbox category data.
 * These are extracted from useInboxContentState to keep the hook within the
 * max-lines-per-function limit. All functions are pure (no hooks or side effects).
 */
import { Email, InboxMode } from 'types/email';

import { CategoryGroup, groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { CATEGORY_OTHER } from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

/**
 * Groups filtered emails by category and returns them as a keyed map.
 * Emails are stamped with `category_id` by the reducer before reaching here,
 * so no name→UUID rekeying is needed — the category field is already a UUID.
 */
export function buildEmailCategoryMap(
  filteredEmails: Email[],
  mode: InboxMode,
  _categorySummary: CategorySummaryItem[] | null | undefined
): Map<string, CategoryGroup> {
  const emailCategoryMap = new Map<string, CategoryGroup>();
  groupEmailsByCategory(filteredEmails, mode).forEach(group => {
    emailCategoryMap.set(group.category, group);
  });
  return emailCategoryMap;
}

export function buildOtherProtoGroups(
  emailCategoryMap: Map<string, CategoryGroup>
): Array<{ name: string; emails: Email[] }> {
  const otherEmails = emailCategoryMap.get(CATEGORY_OTHER)?.emails ?? [];
  const groups = new Map<string, Email[]>();
  otherEmails.forEach(email => {
    const protoName = email.protoCategoryName;
    if (protoName) {
      if (!groups.has(protoName)) {
        groups.set(protoName, []);
      }
      groups.get(protoName)!.push(email);
    }
  });
  return Array.from(groups.entries()).map(([name, groupEmails]) => ({ name, emails: groupEmails }));
}

export function buildDisplayCategories(
  summaryCategories: CategorySummaryItem[] | null,
  filteredEmails: Email[],
  stableCategoryOrder: string[],
  mode: InboxMode
): Array<{ id: string | null; name: string; count: number }> {
  const source: Array<{ id: string | null; name: string; count: number }> =
    summaryCategories ??
    groupEmailsByCategory(filteredEmails, mode).map(grp => ({
      id: null,
      name: grp.category,
      count: grp.emails.length,
    }));

  const nonEmptySource = source.filter(cat => cat.count > 0);
  if (stableCategoryOrder.length === 0) {
    return nonEmptySource;
  }
  const orderMap = new Map(stableCategoryOrder.map((key, idx) => [key, idx]));
  return nonEmptySource.slice().sort((itemA, itemB) => {
    const keyA = getCategoryKey(itemA.id, itemA.name);
    const keyB = getCategoryKey(itemB.id, itemB.name);
    const orderA = orderMap.get(keyA) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.get(keyB) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}
