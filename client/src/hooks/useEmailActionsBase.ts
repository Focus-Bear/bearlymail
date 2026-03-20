import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, getEmailPriorityScore } from 'types/email';
import { invalidateSummaryCache, removeEmailFromCache } from 'utils/emailCache';

import { API_URL } from 'config/api';
import { DEFAULT_PRIORITY_SCORE, PRIORITY_MEDIUM_THRESHOLD } from 'constants/numbers';
import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';
import { selectEmails } from 'store/selectors/emailSelectors';
import {
  addAnimatingOut,
  addOptimisticArchive,
  addOptimisticSnooze,
  decrementCategorySummaryCount,
  incrementCategorySummaryCount,
  removeAnimatingOut,
  removeEmail,
  removeOptimisticArchive,
  removeOptimisticSnooze,
  restoreEmail,
  updateEmail,
} from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';
import { AppDispatch } from 'store/store';

/** Duration (ms) of email exit animations — must match CSS animation durations in App.css */
export const EMAIL_EXIT_ANIMATION_DURATION_MS = 800;

type TabCountFn = ((changes: { triage?: number; action?: number; followUp?: number }) => void) | undefined;

function adjustTabCount(tabFn: TabCountFn, mode: string | undefined, delta: number): void {
  if (!tabFn || !mode) {
    return;
  }
  if (mode === MODE_TRIAGE) {
    tabFn({ triage: delta });
  } else if (mode === MODE_ACTION) {
    tabFn({ action: delta });
  } else if (mode === MODE_FOLLOW_UP) {
    tabFn({ followUp: delta });
  }
}

interface TabCountChanges {
  triage?: number;
  action?: number;
  followUp?: number;
}

interface UseEmailActionsBaseProps {
  fetchEmails: (overrideFilters?: Partial<InboxFilter>) => Promise<void>;
  onSuggestionRemove?: (emailId: string) => void;
  onShowPriorityOverride?: (
    emailId: string,
    originalPriorityScore: number,
    newPriorityScore: number,
    context?: 'archive' | 'star' | 'manual',
    emailSubject?: string
  ) => void;
  onTabCountsUpdateOptimistically?: (changes: TabCountChanges) => void;
  onEmailMoved?: (emailId: string) => void;
  mode?: string;
}

interface UseStarCountMutationParams {
  emails: Email[];
  fetchEmails: (overrideFilters?: Partial<InboxFilter>) => Promise<void>;
  onSuggestionRemove?: (emailId: string) => void;
  onTabCountsUpdateOptimistically?: (changes: TabCountChanges) => void;
  onEmailMoved?: (emailId: string) => void;
  mode?: string;
  dispatch: AppDispatch;
}

/**
 * Encapsulates the star-count mutation with optimistic updates and error revert.
 * Extracted from useEmailActionsBase to keep that hook under the
 * max-lines-per-function limit.
 */
function useStarCountMutation({
  emails,
  fetchEmails,
  onSuggestionRemove,
  onTabCountsUpdateOptimistically,
  onEmailMoved,
  mode,
  dispatch,
}: UseStarCountMutationParams) {
  const priorityAnimationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleSetStarCount = useCallback(
    async (emailId: string, starCount: number, ev?: React.MouseEvent) => {
      ev?.stopPropagation();
      const email = emails.find(em => em.id === emailId);
      const originalStarCount = email?.starCount ?? 0;
      const predictedStarCount = email
        ? Math.round((getEmailPriorityScore(email) / 100) * 3)
        : Math.round((DEFAULT_PRIORITY_SCORE / 100) * 3);

      if (mode === MODE_TRIAGE && starCount > 0) {
        dispatch(addAnimatingOut({ id: emailId, type: 'priority', starCount }));
        removeEmailFromCache(emailId);
        invalidateSummaryCache(mode);
        onSuggestionRemove?.(emailId);
        onTabCountsUpdateOptimistically?.({ triage: -1, action: 1 });
        const tid = setTimeout(() => {
          dispatch(removeEmail(emailId));
          dispatch(removeAnimatingOut(emailId));
          priorityAnimationTimeouts.current.delete(emailId);
          onEmailMoved?.(emailId);
        }, EMAIL_EXIT_ANIMATION_DURATION_MS);
        priorityAnimationTimeouts.current.set(emailId, tid);
      } else if (mode === MODE_ACTION && starCount === 0) {
        dispatch(removeEmail(emailId));
        invalidateSummaryCache(mode);
        onSuggestionRemove?.(emailId);
        onTabCountsUpdateOptimistically?.({ action: -1, triage: 1 });
      } else {
        dispatch(updateEmail({ id: emailId, updates: { starCount } }));
        onSuggestionRemove?.(emailId);
      }

      const discrepancy = Math.abs(starCount - predictedStarCount);
      const result = discrepancy >= 2 && starCount > 0 ? { discrepancy, predictedStarCount } : null;

      axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount }).catch(error => {
        console.error('Error setting star count:', error);
        if (mode === MODE_TRIAGE && starCount > 0 && email) {
          const pending = priorityAnimationTimeouts.current.get(emailId);
          if (pending !== undefined) {
            clearTimeout(pending);
            priorityAnimationTimeouts.current.delete(emailId);
            dispatch(removeAnimatingOut(emailId));
          } else {
            dispatch(restoreEmail(email));
          }
          onTabCountsUpdateOptimistically?.({ triage: 1, action: -1 });
        } else if (mode === MODE_ACTION && starCount === 0 && email) {
          dispatch(restoreEmail(email));
          onTabCountsUpdateOptimistically?.({ action: 1, triage: -1 });
        } else {
          dispatch(updateEmail({ id: emailId, updates: { starCount: originalStarCount } }));
        }
        fetchEmails().catch(err => console.error('Error refreshing after star update error:', err));
      });

      return result;
    },
    [emails, fetchEmails, onSuggestionRemove, dispatch, mode, onTabCountsUpdateOptimistically, onEmailMoved]
  );

  return { handleSetStarCount };
}

export function useEmailActionsBase({
  fetchEmails,
  onSuggestionRemove,
  onShowPriorityOverride,
  onTabCountsUpdateOptimistically,
  onEmailMoved,
  mode,
}: UseEmailActionsBaseProps) {
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);

  // Track pending animation timeouts so they can be cancelled on API error
  const archiveAnimationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const { handleSetStarCount } = useStarCountMutation({
    emails,
    fetchEmails,
    onSuggestionRemove,
    onTabCountsUpdateOptimistically,
    onEmailMoved,
    mode,
    dispatch,
  });

  const handleArchive = useCallback(
    async (emailId: string, archiveEvent: React.MouseEvent) => {
      archiveEvent.stopPropagation();
      const emailToArchive = emails.find(em => em.id === emailId);
      if (!emailToArchive) {
        console.warn('[Archive] Email not found in list:', emailId);
        return;
      }
      const score = getEmailPriorityScore(emailToArchive);
      if (!emailToArchive.isRead && score > PRIORITY_MEDIUM_THRESHOLD && onShowPriorityOverride) {
        onShowPriorityOverride(emailId, score, 0, 'archive', emailToArchive.subject ?? undefined);
        return;
      }
      const categoryKey = emailToArchive.category_id ?? undefined;
      dispatch(addOptimisticArchive(emailId));
      dispatch(addAnimatingOut({ id: emailId, type: 'archive' }));
      // UUID-only: match category by UUID (categoryKey). Never use name as a fallback.
      dispatch(decrementCategorySummaryCount({ categoryKey: categoryKey ?? CATEGORY_KEY_UNCATEGORIZED, count: 1 }));
      removeEmailFromCache(emailId);
      onSuggestionRemove?.(emailId);
      const tid = setTimeout(() => {
        dispatch(removeEmail(emailId));
        dispatch(removeAnimatingOut(emailId));
        archiveAnimationTimeouts.current.delete(emailId);
      }, EMAIL_EXIT_ANIMATION_DURATION_MS);
      archiveAnimationTimeouts.current.set(emailId, tid);
      adjustTabCount(onTabCountsUpdateOptimistically, mode, -1);
      axios.put(`${API_URL}/emails/${emailId}/archive`).catch(error => {
        console.error('[Archive] API call failed:', error);
        const pending = archiveAnimationTimeouts.current.get(emailId);
        if (pending !== undefined) {
          clearTimeout(pending);
          archiveAnimationTimeouts.current.delete(emailId);
          dispatch(removeAnimatingOut(emailId));
        } else if (emailToArchive) {
          dispatch(restoreEmail(emailToArchive));
        }
        dispatch(removeOptimisticArchive(emailId));
        dispatch(incrementCategorySummaryCount({ categoryKey: categoryKey ?? CATEGORY_KEY_UNCATEGORIZED, count: 1 }));
        adjustTabCount(onTabCountsUpdateOptimistically, mode, 1);
        fetchEmails().catch(err => console.error('Error refreshing after archive error:', err));
      });
    },
    [emails, fetchEmails, onSuggestionRemove, dispatch, onShowPriorityOverride, onTabCountsUpdateOptimistically, mode]
  );

  const handleSnooze = useCallback(
    async (emailId: string, duration: string) => {
      if (!duration.trim()) {
        console.warn('Cannot snooze: duration is empty');
        return;
      }
      const emailToSnooze = emails.find(em => em.id === emailId);
      if (!emailToSnooze) {
        console.warn('[Snooze] Email not found in list:', emailId);
        return;
      }

      dispatch(removeEmail(emailId));
      dispatch(addOptimisticSnooze(emailId));
      onSuggestionRemove?.(emailId);
      adjustTabCount(onTabCountsUpdateOptimistically, mode, -1);

      axios.post(`${API_URL}/snooze/${emailId}`, { duration }).catch(error => {
        console.error('[Snooze] API call failed:', error);
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
        }
        dispatch(removeOptimisticSnooze(emailId));
        adjustTabCount(onTabCountsUpdateOptimistically, mode, 1);
        fetchEmails().catch(err => console.error('Error refreshing after snooze error:', err));
        throw error;
      });
    },
    [emails, fetchEmails, onSuggestionRemove, dispatch, onTabCountsUpdateOptimistically, mode]
  );

  return {
    handleSetStarCount,
    handleArchive,
    handleSnooze,
  };
}
