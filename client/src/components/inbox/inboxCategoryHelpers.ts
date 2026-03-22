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
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

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
  // After fix #1294: groupEmailsByCategory() now uses getCategoryKey(), so
  // emails with no category_id are keyed as CATEGORY_KEY_UNCATEGORIZED ("uncategorized")
  // instead of CATEGORY_OTHER ("Other"). Use the constant to keep keys in sync.
  const otherEmails = emailCategoryMap.get(CATEGORY_KEY_UNCATEGORIZED)?.emails ?? [];
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

  // Fix #1258: merge entries with duplicate display names (server-side dedup is
  // the primary fix; this is a defensive frontend layer that prevents duplicate
  // accordions if stale cached data slips through).
  const mergedByName = new Map<string, { id: string | null; name: string; count: number }>();
  for (const cat of source) {
    const existing = mergedByName.get(cat.name);
    if (existing) {
      // Combine counts; keep the first-seen UUID as canonical
      existing.count += cat.count;
    } else {
      mergedByName.set(cat.name, { ...cat });
    }
  }
  const mergedSource = Array.from(mergedByName.values());

  const nonEmptySource = mergedSource.filter(cat => cat.count > 0);
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
