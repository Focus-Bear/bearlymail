import { useSelector } from 'react-redux';

import { getCategoryKey } from 'hooks/useEmailFetching';
import {
  selectEmails,
  selectOptimisticallyArchived,
  selectOptimisticallySnoozed,
} from 'store/selectors/emailSelectors';

/**
 * Counts emails the store holds for this category that the list then hides because
 * they are still marked optimistically archived/snoozed. A non-zero value means the
 * server returned rows the client is suppressing — the "count but no rows" variant
 * of issue #2062 caused by a stale optimistic removal.
 */
export function useHiddenCategoryEmailCount(categoryKey: string): number {
  const emails = useSelector(selectEmails);
  const archivedIds = useSelector(selectOptimisticallyArchived);
  const snoozedIds = useSelector(selectOptimisticallySnoozed);
  const hiddenIds = new Set([...archivedIds, ...snoozedIds]);
  return emails.filter(
    email => hiddenIds.has(email.id) && getCategoryKey(email.category_id, email.category ?? undefined) === categoryKey
  ).length;
}
