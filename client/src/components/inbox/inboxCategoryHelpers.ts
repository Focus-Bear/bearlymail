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
 * Uses display order (category-grouped) so the "next" email matches what the user
 * sees on screen, not the flat server-sort order. Only considers emails in expanded
 * (visible) categories — emails inside collapsed drawers are invisible to the user
 * and should never be navigated to. Fixes: wrong email opened + wrong highlight after
 * split-view actions.
 */
export function navigateAfterSplitViewAction(
  removedEmailId: string,
  emails: Email[],
  mode: InboxMode,
  splitView: SplitViewHandle,
  setSelectedEmailIndex: (index: number) => void,
  expandedCategories?: Set<string>
): void {
  // Include the removed email even if it is already marked archived so we can
  // determine its visual position before it disappears from the list.
  const activeWithRemoved = emails.filter(email => !email.isArchived || email.id === removedEmailId);

  // Only consider emails in expanded (visible) categories. Filter the grouped
  // output directly so the visibility check uses the same category key the UI
  // renders (including the phishing override inside groupEmailsByCategory).
  // If expandedCategories is not provided, fall back to all emails (safe default).
  const groupedEmails = groupEmailsByCategory(activeWithRemoved, mode);
  const displayOrdered = (
    expandedCategories
      ? groupedEmails.filter(group => expandedCategories.has(group.category))
      : groupedEmails
  ).flatMap(group => group.emails);
  const removedDisplayIndex = displayOrdered.findIndex(email => email.id === removedEmailId);

  // Remaining visible emails after the action, in display order
  const remaining = displayOrdered.filter(email => email.id !== removedEmailId);

  if (remaining.length === 0) {
    splitView.closeEmail();
    return;
  }

  // The email that slides up to fill the removed email's visual slot
  const nextDisplayIndex = Math.min(
    removedDisplayIndex >= 0 ? removedDisplayIndex : 0,
    remaining.length - 1
  );
  splitView.openEmail(remaining[nextDisplayIndex].id);
  setSelectedEmailIndex(nextDisplayIndex);
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