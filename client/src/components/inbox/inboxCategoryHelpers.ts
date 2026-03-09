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

export function buildEmailCategoryMap(
  filteredEmails: Email[],
  mode: InboxMode,
  categorySummary: CategorySummaryItem[] | null | undefined
): Map<string, CategoryGroup> {
  // [DIAGNOSTIC #784] Log inputs
  console.log('[DEBUG #784] buildEmailCategoryMap INPUT:', {
    filteredEmailCount: filteredEmails.length,
    categorySummaryCount: categorySummary?.length ?? 'null/undefined',
    // Show category_id presence on filtered emails
    filteredEmailCategoryFields: filteredEmails.map(email => ({
      id: email.id,
      category: email.category,
      category_id: email.category_id,
    })),
    summaryCategoryKeys: categorySummary?.map(cat => ({ name: cat.name, id: cat.id, key: getCategoryKey(cat.id, cat.name) })),
  });

  const map = new Map<string, CategoryGroup>();
  groupEmailsByCategory(filteredEmails, mode).forEach(group => {
    map.set(group.category, group);
  });

  // [DIAGNOSTIC #784] Log intermediate map after groupEmailsByCategory
  console.log('[DEBUG #784] buildEmailCategoryMap AFTER groupEmailsByCategory:', {
    mapKeys: Array.from(map.keys()),
    mapSizes: Array.from(map.entries()).map(([key, val]) => ({ key, emailCount: val.emails.length })),
  });

  if (!categorySummary) {
    console.log('[DEBUG #784] buildEmailCategoryMap: no categorySummary, returning raw map');
    return map;
  }
  const nameToKey = new Map(categorySummary.map(cat => [cat.name, getCategoryKey(cat.id, cat.name)]));

  // [DIAGNOSTIC #784] Log nameToKey mapping
  console.log('[DEBUG #784] buildEmailCategoryMap nameToKey:', Array.from(nameToKey.entries()));

  const rekeyed = new Map<string, CategoryGroup>();
  map.forEach((value, key) => {
    const uuidKey = nameToKey.get(key);
    // [DIAGNOSTIC #784] Log each rekeying decision
    console.log('[DEBUG #784] buildEmailCategoryMap rekeying:', {
      originalKey: key,
      resolvedUuidKey: uuidKey,
      finalKey: uuidKey ?? key,
      emailCount: value.emails.length,
      nameToKeyHit: uuidKey !== undefined,
    });
    rekeyed.set(uuidKey ?? key, { ...value, category: uuidKey ?? key });
  });

  // [DIAGNOSTIC #784] Log final rekeyed map
  console.log('[DEBUG #784] buildEmailCategoryMap FINAL rekeyed map:', {
    rekeyedKeys: Array.from(rekeyed.keys()),
    rekeyedSizes: Array.from(rekeyed.entries()).map(([key, val]) => ({ key, emailCount: val.emails.length })),
  });

  return rekeyed;
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
