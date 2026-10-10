import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PayloadAction } from '@reduxjs/toolkit';
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
  addOptimisticSnooze,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  removeEmail,
  removeOptimisticArchive,
  removeOptimisticSnooze,
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
  handleBulkSnooze: (duration: string) => Promise<void>;
  handleBulkStar: (starCount: number) => Promise<void>;
  handleBulkMarkAsRead: () => Promise<void>;
  handleBulkMarkAsUnread: () => Promise<void>;
}

/** Marks/unmarks an email as optimistically removed (addOptimisticArchive, removeOptimisticSnooze, …). */
type OptimisticRemovalAction = (emailId: string) => PayloadAction<string>;

function collectBulkTargets(
  emailIds: string[],
  emails: Email[]
): { targetEmails: Email[]; categoryCountChanges: Map<string, number> } {
  const emailsById = new Map(emails.map(email => [email.id, email]));
  const targetEmails: Email[] = [];
  const categoryCountChanges = new Map<string, number>();

  emailIds.forEach(id => {
    const email = emailsById.get(id);
    if (email) {
      targetEmails.push(email);
      // UUID-only keying: use category_id when available, "uncategorized" otherwise.
      // Never use the category name string as a key.
      const categoryKey = email.category_id ?? CATEGORY_KEY_UNCATEGORIZED;
      categoryCountChanges.set(categoryKey, (categoryCountChanges.get(categoryKey) || 0) + 1);
    }
  });

  return { targetEmails, categoryCountChanges };
}

function adjustTabCountForMode(
  mode: string | undefined,
  delta: number,
  onTabCountsUpdateOptimistically: ((changes: TabCountChanges) => void) | undefined
): void {
  if (!onTabCountsUpdateOptimistically) {
    return;
  }
  if (mode === MODE_TRIAGE) {
    onTabCountsUpdateOptimistically({ triage: delta });
  } else if (mode === MODE_ACTION) {
    onTabCountsUpdateOptimistically({ action: delta });
  } else if (mode === MODE_FOLLOW_UP) {
    onTabCountsUpdateOptimistically({ followUp: delta });
  }
}

/** Everything the optimistic helpers need beyond the emails themselves. */
interface BulkRemovalContext {
  dispatch: AppDispatch;
  categoryCountChanges: Map<string, number>;
  mode: string | undefined;
  onTabCountsUpdateOptimistically: ((changes: TabCountChanges) => void) | undefined;
}

/**
 * Removes emails from the list immediately and records them as optimistically
 * removed, so a fetch that lands before the API call finishes cannot flash them
 * back. Shared by bulk archive and bulk snooze — they differ only in which
 * optimistic marker they set.
 */
function applyOptimisticRemoval(
  context: BulkRemovalContext,
  emailIds: string[],
  markOptimistic: OptimisticRemovalAction
): void {
  const { dispatch, categoryCountChanges, mode, onTabCountsUpdateOptimistically } = context;
  emailIds.forEach(id => {
    dispatch(removeEmail(id));
    dispatch(markOptimistic(id));
  });
  categoryCountChanges.forEach((count, categoryKey) => {
    dispatch(decrementCategorySummaryCount({ categoryKey, count }));
  });
  adjustTabCountForMode(mode, -emailIds.length, onTabCountsUpdateOptimistically);
}

function revertOptimisticRemoval(
  context: BulkRemovalContext,
  targetEmails: Email[],
  unmarkOptimistic: OptimisticRemovalAction
): void {
  const { dispatch, categoryCountChanges, mode, onTabCountsUpdateOptimistically } = context;
  targetEmails.forEach(email => {
    dispatch(restoreEmail(email));
    dispatch(unmarkOptimistic(email.id));
  });
  categoryCountChanges.forEach((count, categoryKey) => {
    dispatch(incrementCategorySummaryCount({ categoryKey, count }));
  });
  adjustTabCountForMode(mode, targetEmails.length, onTabCountsUpdateOptimistically);
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

      const { targetEmails, categoryCountChanges } = collectBulkTargets(emailIdsToArchive, emails);
      const removalContext = { dispatch, categoryCountChanges, mode, onTabCountsUpdateOptimistically };
      applyOptimisticRemoval(removalContext, emailIdsToArchive, addOptimisticArchive);

      try {
        await axios.post(`${API_URL}/emails/bulk/archive`, { emailIds: emailIdsToArchive });
        devLog(`[BulkArchive] Successfully archived ${emailIdsToArchive.length} emails`);
      } catch (error) {
        console.error('[BulkArchive] Failed to archive emails:', error);
        revertOptimisticRemoval(removalContext, targetEmails, removeOptimisticArchive);
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

      const { targetEmails, categoryCountChanges } = collectBulkTargets(emailIdsToArchive, emails);
      const removalContext = { dispatch, categoryCountChanges, mode, onTabCountsUpdateOptimistically };
      applyOptimisticRemoval(removalContext, emailIdsToArchive, addOptimisticArchive);

      try {
        const response = await axios.post<{ archived: number; suggestion: CategoryArchiveSuggestion | null }>(
          `${API_URL}/category-workflows/archive-all`,
          { emailIds: emailIdsToArchive }
        );
        return response.data.suggestion ?? null;
      } catch (error) {
        console.error('[CategoryArchiveAll] Failed to archive emails:', error);
        revertOptimisticRemoval(removalContext, targetEmails, removeOptimisticArchive);
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

  /**
   * Snooze every selected email until the same moment. The server parses the
   * duration once so the whole selection wakes together, rather than drifting by
   * however long each request took.
   */
  const handleBulkSnooze = useCallback(
    async (duration: string) => {
      const trimmedDuration = duration.trim();
      if (selectedEmailIds.size === 0 || !trimmedDuration) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.BULK_SNOOZE_CONFIRMED, {
        selected_count: selectedEmailIds.size,
        snooze_input_length: trimmedDuration.length,
      });

      const emailIds = Array.from(selectedEmailIds);
      setSelectedEmailIds(new Set());
      const { targetEmails, categoryCountChanges } = collectBulkTargets(emailIds, emails);
      const removalContext = { dispatch, categoryCountChanges, mode, onTabCountsUpdateOptimistically };
      applyOptimisticRemoval(removalContext, emailIds, addOptimisticSnooze);

      try {
        await axios.post(`${API_URL}/snooze/bulk`, { emailIds, duration: trimmedDuration });
        devLog(`[BulkSnooze] Successfully snoozed ${emailIds.length} emails`);
      } catch (error) {
        console.error('[BulkSnooze] Failed to snooze emails:', error);
        revertOptimisticRemoval(removalContext, targetEmails, removeOptimisticSnooze);
      }
    },
    [dispatch, emails, selectedEmailIds, setSelectedEmailIds, onTabCountsUpdateOptimistically, mode]
  );

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
    handleBulkSnooze,
    handleBulkStar,
    handleBulkMarkAsRead: handleBulkMarkAsReadAction,
    handleBulkMarkAsUnread: handleBulkMarkAsUnreadAction,
  };
}
