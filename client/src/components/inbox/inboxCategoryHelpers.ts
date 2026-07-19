/**
 * Pure computation helpers for inbox category data.
 * These are extracted from useInboxContentState to keep the hook within the
 * max-lines-per-function limit. All functions are pure (no hooks or side effects).
 */
import { Email, InboxMode } from 'types/email';

import { CategoryGroup, groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

/**
 * Returns emails in the same display order as the UI renders them:
 * groups are sorted by max priority descending, and emails within each group
 * are sorted by priority descending (matching `groupEmailsByCategory`).
 *
 * Use this instead of the flat server list whenever you need to know which
 * email appears "below" another in the visible inbox.
 */
export function getDisplayOrderedEmails(emails: Email[], mode: InboxMode): Email[] {
  return groupEmailsByCategory(emails, mode).flatMap(group => group.emails);
}

type SplitViewHandle = { openEmail: (id: string) => void; closeEmail: () => void };

/**
 * After an email is removed from the split-view panel (archive, snooze, priority change),
 * navigate to the email that visually replaces it and update the left-panel highlight.
 *
 * Navigation priority:
 * 1. Stay within the same drawer — pick the next email at the same position within
 *    the removed email's category. This avoids jumping to a different drawer when
 *    the user is working through a category one email at a time.
 * 2. If the drawer is now empty, fall back to the next email in the flat display
 *    order across all visible categories.
 *
 * Only considers emails in expanded (visible) categories — collapsed drawers are
 * invisible and should never receive auto-navigation focus.
 */
export function navigateAfterSplitViewAction(
  removedEmailId: string,
  emails: Email[],
  mode: InboxMode,
  splitView: SplitViewHandle,
  setSelectedEmailIndex: (index: number) => void,
  expandedCategories?: Set<string>
): void {
  const picked = pickNextEmailAfterRemoval(removedEmailId, emails, mode, expandedCategories);
  if (!picked) {
    splitView.closeEmail();
    return;
  }
  splitView.openEmail(picked.nextEmailId);
  setSelectedEmailIndex(picked.nextIndexInRemaining);
}

/**
 * Which email visually replaces the removed one, in display order (same
 * drawer-first rules as {@link navigateAfterSplitViewAction}). Returns null
 * when no email remains in any expanded category.
 */
export function pickNextEmailAfterRemoval(
  removedEmailId: string,
  emails: Email[],
  mode: InboxMode,
  expandedCategories?: Set<string>
): { nextEmailId: string; nextIndexInRemaining: number } | null {
  // Include the removed email so we can determine its position before it disappears.
  const activeWithRemoved = emails.filter(email => !email.isArchived || email.id === removedEmailId);

  const groupedEmails = groupEmailsByCategory(activeWithRemoved, mode);
  const visibleGroups = expandedCategories
    ? groupedEmails.filter(group => expandedCategories.has(group.category))
    : groupedEmails;

  const displayOrdered = visibleGroups.flatMap(group => group.emails);
  const remaining = displayOrdered.filter(email => email.id !== removedEmailId);

  if (remaining.length === 0) {
    return null;
  }

  // Find the drawer (category group) that owns the removed email.
  const removedGroup = visibleGroups.find(group =>
    group.emails.some(email => email.id === removedEmailId)
  );
  const siblingsInSameDrawer = removedGroup
    ? removedGroup.emails.filter(email => email.id !== removedEmailId)
    : [];

  let nextEmailId: string;

  if (siblingsInSameDrawer.length > 0) {
    // Stay in the same drawer: use the same position, clamped to the new last index.
    const positionInDrawer = removedGroup!.emails.findIndex(email => email.id === removedEmailId);
    nextEmailId = siblingsInSameDrawer[Math.min(positionInDrawer, siblingsInSameDrawer.length - 1)].id;
  } else {
    // Drawer is now empty — fall back to the next email in the overall display order.
    const removedDisplayIndex = displayOrdered.findIndex(email => email.id === removedEmailId);
    const fallbackIndex = Math.min(
      removedDisplayIndex >= 0 ? removedDisplayIndex : 0,
      remaining.length - 1
    );
    nextEmailId = remaining[fallbackIndex].id;
  }

  const nextIndexInRemaining = remaining.findIndex(email => email.id === nextEmailId);
  return { nextEmailId, nextIndexInRemaining };
}

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