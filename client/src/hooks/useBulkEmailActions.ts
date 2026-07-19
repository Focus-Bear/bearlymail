import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email } from 'types/email';
import { CategoryArchiveSuggestion } from 'utils/categoryArchiveWorkflow';
import { devLog } from 'utils/dev-logger';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { selectEmails } from 'store/selectors/emailSelectors';
import {
  addOptimisticArchive,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  removeEmail,
  removeOptimisticArchive,
  restoreEmail,
} from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';
import { AppDispatch } from 'store/store';

/** Promise.allSettled rejected-status literal (lint: no magic strings). */
const REJECTED_STATUS = 'rejected';

interface TabCountChanges {
  triage?: number;
  action?: number;
  followUp?: number;
}

interface UseBulkEmailActionsProps {
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  handleSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  handleBulkMarkAsRead?: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread?: (emailIds: string[]) => Promise<void>;
  onTabCountsUpdateOptimistically?: (changes: TabCountChanges) => void;
  mode?: string;
}

interface UseBulkEmailActionsReturn {
  handleBulkArchive: () => Promise<void>;
  handleBulkArchiveByIds: (emailIds: string[]) => Promise<void>;
  handleCategoryArchiveAll: (emailIds: string[]) => Promise<CategoryArchiveSuggestion | null>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

function collectArchiveTargets(
  emailIds: string[],
  emails: Email[]
): { emailsToArchive: Email[]; categoryCountChanges: Map<string, number> } {
  const emailsById = new Map(emails.map(email => [email.id, email]));
  const emailsToArchive: Email[] = [];
  const categoryCountChanges = new Map<string, number>();

  emailIds.forEach(id => {
    const email = emailsById.get(id);
    if (email) {
      emailsToArchive.push(email);
      // UUID-only keying: use category_id when available, "uncategorized" otherwise.
      // Never use the category name string as a key.
      const categoryKey = email.category_id ?? CATEGORY_KEY_UNCATEGORIZED;
      categoryCountChanges.set(categoryKey, (categoryCountChanges.get(categoryKey) || 0) + 1);
    }
  });

  return { emailsToArchive, categoryCountChanges };
}

function applyOptimisticArchiveUpdates(
  dispatch: AppDispatch,
  emailIds: string[],
  categoryCountChanges: Map<string, number>,
  mode: string | undefined,
  onTabCountsUpdateOptimistically: ((changes: TabCountChanges) => void) | undefined
): void {
  emailIds.forEach(id => {
    dispatch(removeEmail(id));
    dispatch(addOptimisticArchive(id));
  });
  categoryCountChanges.forEach((count, categoryKey) => {
    dispatch(decrementCategorySummaryCount({ categoryKey, count }));
  });
  if (onTabCountsUpdateOptimistically) {
    if (mode === MODE_TRIAGE) {
      onTabCountsUpdateOptimistically({ triage: -emailIds.length });
    } else if (mode === MODE_ACTION) {
      onTabCountsUpdateOptimistically({ action: -emailIds.length });
    } else if (mode === MODE_FOLLOW_UP) {
      onTabCountsUpdateOptimistically({ followUp: -emailIds.length });
    }
  }
}

function revertOptimisticArchiveUpdates(
  dispatch: AppDispatch,
  emailsToArchive: Email[],
  categoryCountChanges: Map<string, number>,
  mode: string | undefined,
  onTabCountsUpdateOptimistically: ((changes: TabCountChanges) => void) | undefined
): void {
  emailsToArchive.forEach(email => {
    dispatch(restoreEmail(email));
    dispatch(removeOptimisticArchive(email.id));
  });
  categoryCountChanges.forEach((count, categoryKey) => {
    dispatch(incrementCategorySummaryCount({ categoryKey, count }));
  });
  if (onTabCountsUpdateOptimistically) {
    if (mode === MODE_TRIAGE) {
      onTabCountsUpdateOptimistically({ triage: emailsToArchive.length });
    } else if (mode === MODE_ACTION) {
      onTabCountsUpdateOptimistically({ action: emailsToArchive.length });
    } else if (mode === MODE_FOLLOW_UP) {
      onTabCountsUpdateOptimistically({ followUp: emailsToArchive.length });
    }
  }
}

export function useBulkEmailActions({
  selectedEmailIds,
  setSelectedEmailIds,
  handleArchive,
  handleSetStarCount,
  handleBulkMarkAsRead,
  handleBulkMarkAsUnread,
  onTabCountsUpdateOptimistically,
  mode,
}: UseBulkEmailActionsProps): UseBulkEmailActionsReturn {
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);

  const handleBulkArchiveByIds = useCallback(
    async (emailIdsToArchive: string[]) => {
      if (emailIdsToArchive.length === 0) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.BULK_ARCHIVE_CLICKED, { selected_count: emailIdsToArchive.length });

      const { emailsToArchive, categoryCountChanges } = collectArchiveTargets(emailIdsToArchive, emails);
      applyOptimisticArchiveUpdates(
        dispatch,
        emailIdsToArchive,
        categoryCountChanges,
        mode,
        onTabCountsUpdateOptimistically
      );

      try {
        await axios.post(`${API_URL}/emails/bulk/archive`, { emailIds: emailIdsToArchive });
        devLog(`[BulkArchive] Successfully archived ${emailIdsToArchive.length} emails`);
      } catch (error) {
        console.error('[BulkArchive] Failed to archive emails:', error);
        revertOptimisticArchiveUpdates(
          dispatch,
          emailsToArchive,
          categoryCountChanges,
          mode,
          onTabCountsUpdateOptimistically
        );
      }
    },
    [dispatch, emails, onTabCountsUpdateOptimistically, mode]
  );

  /**
   * Archive every email in a category "archive all". Same optimistic flow as
   * bulk archive, but routed through the category-workflows endpoint so the
   * server can track "blind" archive-alls and, after enough of them, return a
   * suggestion to auto-archive the category. Returns that suggestion (or null).
   */
  const handleCategoryArchiveAll = useCallback(
    async (emailIdsToArchive: string[]): Promise<CategoryArchiveSuggestion | null> => {
      if (emailIdsToArchive.length === 0) {
        return null;
      }
      captureEvent(ANALYTICS_EVENTS.BULK_ARCHIVE_CLICKED, { selected_count: emailIdsToArchive.length });

      const { emailsToArchive, categoryCountChanges } = collectArchiveTargets(emailIdsToArchive, emails);
      applyOptimisticArchiveUpdates(
        dispatch,
        emailIdsToArchive,
        categoryCountChanges,
        mode,
        onTabCountsUpdateOptimistically
      );

      try {
        const response = await axios.post<{ archived: number; suggestion: CategoryArchiveSuggestion | null }>(
          `${API_URL}/category-workflows/archive-all`,
          { emailIds: emailIdsToArchive }
        );
        return response.data.suggestion ?? null;
      } catch (error) {
        console.error('[CategoryArchiveAll] Failed to archive emails:', error);
        revertOptimisticArchiveUpdates(
          dispatch,
          emailsToArchive,
          categoryCountChanges,
          mode,
          onTabCountsUpdateOptimistically
        );
        return null;
      }
    },
    [dispatch, emails, onTabCountsUpdateOptimistically, mode]
  );

  const handleBulkArchive = useCallback(async () => {
    if (selectedEmailIds.size === 0) {
      return;
    }
    const emailIds = Array.from(selectedEmailIds);
    setSelectedEmailIds(new Set());
    await handleBulkArchiveByIds(emailIds);
  }, [selectedEmailIds, setSelectedEmailIds, handleBulkArchiveByIds]);

  const handleBulkStar = useCallback(
    async (starCount: number) => {
      if (selectedEmailIds.size === 0) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.BULK_STAR_SET, { star_count: starCount, selected_count: selectedEmailIds.size });
      // Match handleBulkArchive's ordering: clear the selection up front, then perform
      // the operation with errors handled internally so the selection state is consistent
      // regardless of outcome.
      const emailIds = Array.from(selectedEmailIds);
      setSelectedEmailIds(new Set());
      // allSettled (not all): every star call runs to completion and every
      // failure is surfaced — Promise.all would bail on the first rejection
      // and leave later rejections unhandled. handleSetStarCount reverts its
      // own optimistic update per email, so no bulk revert is needed.
      const results = await Promise.allSettled(
        emailIds.map(id => handleSetStarCount(id, starCount))
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === REJECTED_STATUS
      );
      if (failures.length > 0) {
        console.error(
          `[BulkStar] Failed to set star count for ${failures.length}/${emailIds.length} emails:`,
          failures[0].reason
        );
      }
    },
    [selectedEmailIds, handleSetStarCount, setSelectedEmailIds]
  );

  const handleBulkMarkAsReadAction = useCallback(async () => {
    if (selectedEmailIds.size === 0 || !handleBulkMarkAsRead) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.BULK_MARK_AS_READ_CLICKED, { selected_count: selectedEmailIds.size });
    await handleBulkMarkAsRead(Array.from(selectedEmailIds));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleBulkMarkAsRead, setSelectedEmailIds]);

  const handleBulkMarkAsUnreadAction = useCallback(async () => {
    if (selectedEmailIds.size === 0 || !handleBulkMarkAsUnread) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.BULK_MARK_AS_UNREAD_CLICKED, { selected_count: selectedEmailIds.size });
    await handleBulkMarkAsUnread(Array.from(selectedEmailIds));
    setSelectedEmailIds(new Set());
  }, [selectedEmailIds, handleBulkMarkAsUnread, setSelectedEmailIds]);

  return {
    handleBulkArchive,
    handleBulkArchiveByIds,
    handleCategoryArchiveAll,
    handleBulkStar,
    handleBulkMarkAsRead: handleBulkMarkAsReadAction,
    handleBulkMarkAsUnread: handleBulkMarkAsUnreadAction,
  };
}
