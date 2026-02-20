import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_PRIORITY_SCORE, PRIORITY_MEDIUM_THRESHOLD } from 'constants/numbers';
import axios from 'axios';
import { Email, getEmailPriorityScore } from 'types/email';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { removeEmail, updateEmail, restoreEmail, addOptimisticArchive, removeOptimisticArchive, addOptimisticSnooze, removeOptimisticSnooze, addAnimatingOut, removeAnimatingOut } from 'store/slices/emailSlice';
import { selectEmails } from 'store/selectors/emailSelectors';

/** Duration (ms) of email exit animations — must match CSS animation durations in App.css */
export const EMAIL_EXIT_ANIMATION_DURATION_MS = 800;

interface TabCountChanges {
  triage?: number;
  action?: number;
  followUp?: number;
}

interface UseEmailActionsBaseProps {
  fetchEmails: () => Promise<void>;
  onSuggestionRemove?: (emailId: string) => void;
  onShowPriorityOverride?: (emailId: string, originalPriorityScore: number, newPriorityScore: number, context?: 'archive' | 'star' | 'manual') => void;
  onTabCountsUpdateOptimistically?: (changes: TabCountChanges) => void;
  mode?: string;
}

export function useEmailActionsBase({
  fetchEmails,
  onSuggestionRemove,
  onShowPriorityOverride,
  onTabCountsUpdateOptimistically,
  mode,
}: UseEmailActionsBaseProps) {
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);

  // Track pending animation timeouts so they can be cancelled on API error
  const archiveAnimationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const priorityAnimationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleSetStarCount = useCallback(async (emailId: string, starCount: number, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const email = emails.find(e => e.id === emailId);
    const originalStarCount = email?.starCount ?? 0;
    const predictedStarCount = email
      ? Math.round((getEmailPriorityScore(email) / 100) * 3)
      : Math.round(DEFAULT_PRIORITY_SCORE / 100 * 3);

    // In Triage mode, starring an email (starCount > 0) should remove it from the list
    // since starred emails belong in the Action tab
    if (mode === 'triage' && starCount > 0) {
      // Animate the email out with 🏗️ overlay before removing it
      dispatch(addAnimatingOut({ id: emailId, type: 'priority' }));
      onSuggestionRemove?.(emailId);
      // Optimistically update tab counts: decrement triage, increment action
      if (onTabCountsUpdateOptimistically) {
        onTabCountsUpdateOptimistically({ triage: -1, action: 1 });
      }
      // Remove from list after animation completes
      const priorityTimeoutId = setTimeout(() => {
        dispatch(removeEmail(emailId));
        dispatch(removeAnimatingOut(emailId));
        priorityAnimationTimeouts.current.delete(emailId);
      }, EMAIL_EXIT_ANIMATION_DURATION_MS);
      priorityAnimationTimeouts.current.set(emailId, priorityTimeoutId);
    } else if (mode === 'action' && starCount === 0) {
      // In Action mode, unstarring an email (starCount = 0) should remove it from the list
      // since unstarred emails belong in the Triage tab
      dispatch(removeEmail(emailId));
      onSuggestionRemove?.(emailId);
      // Optimistically update tab counts: decrement action, increment triage
      if (onTabCountsUpdateOptimistically) {
        onTabCountsUpdateOptimistically({ action: -1, triage: 1 });
      }
    } else {
      // Optimistic update - update UI immediately
      dispatch(updateEmail({ id: emailId, updates: { starCount } }));
      onSuggestionRemove?.(emailId);
    }

    // Calculate and return discrepancy info immediately (for modal display)
    const discrepancy = Math.abs(starCount - predictedStarCount);
    const result = (discrepancy >= 2 && starCount > 0) 
      ? { discrepancy, predictedStarCount } 
      : null;

    // Make API call in background (non-blocking)
    // Note: We don't update tab counts in the .then() callback because:
    // 1. We already optimistically updated the counts above
    // 2. The server processes star changes asynchronously, so fetching counts would return stale data
    axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount })
      .catch((error) => {
        console.error('Error setting star count:', error);
        // Revert optimistic update on error - restore email to list or star count
        if (mode === 'triage' && starCount > 0 && email) {
          const pendingTimeout = priorityAnimationTimeouts.current.get(emailId);
          if (pendingTimeout !== undefined) {
            // Animation hasn't finished yet — cancel it and stop the animation
            clearTimeout(pendingTimeout);
            priorityAnimationTimeouts.current.delete(emailId);
            dispatch(removeAnimatingOut(emailId));
            // Email is still in state.emails, no need to restore
          } else {
            // Animation already completed and email was removed — restore it
            dispatch(restoreEmail(email));
          }
          // Revert tab count changes
          if (onTabCountsUpdateOptimistically) {
            onTabCountsUpdateOptimistically({ triage: 1, action: -1 });
          }
        } else if (mode === 'action' && starCount === 0 && email) {
          dispatch(restoreEmail(email));
          // Revert tab count changes
          if (onTabCountsUpdateOptimistically) {
            onTabCountsUpdateOptimistically({ action: 1, triage: -1 });
          }
        } else {
          dispatch(updateEmail({ id: emailId, updates: { starCount: originalStarCount } }));
        }
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after star update error:', err));
      });

    // Return immediately without waiting for API
    return result;
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, mode, onTabCountsUpdateOptimistically]);

  const handleArchive = useCallback(async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    console.log('[Archive] Starting archive for email:', emailId);
    const emailToArchive = emails.find(e => e.id === emailId);
    if (!emailToArchive) {
      console.warn('[Archive] Email not found in list:', emailId);
      return;
    }

    console.log('[Archive] Email found:', { id: emailToArchive.id, subject: emailToArchive.subject, threadId: emailToArchive.threadId });

    // Check if email is unread and has priority > 20 - if so, show priority override modal
    const priorityScore = getEmailPriorityScore(emailToArchive);
    if (!emailToArchive.isRead && priorityScore > PRIORITY_MEDIUM_THRESHOLD && onShowPriorityOverride) {
      // Show priority override modal with archive context - user will archive after submitting
      onShowPriorityOverride(emailId, priorityScore, 0, 'archive'); // 0 = low priority (archiving)
      return;
    }
    
    // Add to optimistic archive immediately so fetches don't re-show the email
    // Also start the fly-out animation; the email is removed from the list after animation
    console.log('[Archive] Dispatching addOptimisticArchive and addAnimatingOut');
    dispatch(addOptimisticArchive(emailId));
    dispatch(addAnimatingOut({ id: emailId, type: 'archive' }));
    onSuggestionRemove?.(emailId);
    // Remove from list after animation completes (duration matches animate-fly-out-right in App.css)
    const archiveTimeoutId = setTimeout(() => {
      dispatch(removeEmail(emailId));
      dispatch(removeAnimatingOut(emailId));
      archiveAnimationTimeouts.current.delete(emailId);
    }, EMAIL_EXIT_ANIMATION_DURATION_MS);
    archiveAnimationTimeouts.current.set(emailId, archiveTimeoutId);

    // Optimistically update tab counts based on current mode
    // Archive removes the email from the current tab
    if (onTabCountsUpdateOptimistically) {
      if (mode === 'triage') {
        onTabCountsUpdateOptimistically({ triage: -1 });
      } else if (mode === 'action') {
        onTabCountsUpdateOptimistically({ action: -1 });
      } else if (mode === 'follow-up') {
        onTabCountsUpdateOptimistically({ followUp: -1 });
      }
    }

    console.log('[Archive] Making API call to archive email');
    // Make API call in background (non-blocking)
    // Note: We don't update tab counts in the .then() callback because:
    // 1. We already optimistically updated the counts above
    // 2. The server processes archive as a background job, so fetching counts would return stale data
    axios.put(`${API_URL}/emails/${emailId}/archive`)
      .then((response) => {
        console.log('[Archive] API call successful:', response.data);
        // After successful archive, keep it in optimistic set - it will be filtered out anyway
        // No need to call fetchEmails() - the optimistic update is sufficient
      })
      .catch((error) => {
        console.error('[Archive] API call failed:', error);
        console.log('[Archive] Reverting optimistic update');
        // Cancel the animation timeout and remove from animatingOut so email becomes visible again
        const pendingArchiveTimeout = archiveAnimationTimeouts.current.get(emailId);
        if (pendingArchiveTimeout !== undefined) {
          clearTimeout(pendingArchiveTimeout);
          archiveAnimationTimeouts.current.delete(emailId);
          dispatch(removeAnimatingOut(emailId));
          // Email is still in state.emails — no need to restore
        } else {
          // Animation already completed and email was removed — restore it
          if (emailToArchive) {
            dispatch(restoreEmail(emailToArchive));
          }
        }
        dispatch(removeOptimisticArchive(emailId));
        // Revert tab count changes
        if (onTabCountsUpdateOptimistically) {
          if (mode === 'triage') {
            onTabCountsUpdateOptimistically({ triage: 1 });
          } else if (mode === 'action') {
            onTabCountsUpdateOptimistically({ action: 1 });
          } else if (mode === 'follow-up') {
            onTabCountsUpdateOptimistically({ followUp: 1 });
          }
        }
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after archive error:', err));
      });
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, onShowPriorityOverride, onTabCountsUpdateOptimistically, mode]);

  const handleSnooze = useCallback(async (emailId: string, duration: string) => {
    if (!duration.trim()) {
      console.warn('Cannot snooze: duration is empty');
      return;
    }

    console.log('[Snooze] Starting snooze for email:', emailId);
    const emailToSnooze = emails.find(e => e.id === emailId);
    if (!emailToSnooze) {
      console.warn('[Snooze] Email not found in list:', emailId);
      return;
    }

    // Optimistic update - remove from list immediately and add to optimistic snooze set
    console.log('[Snooze] Dispatching removeEmail and addOptimisticSnooze');
    dispatch(removeEmail(emailId));
    dispatch(addOptimisticSnooze(emailId));
    onSuggestionRemove?.(emailId);

    // Optimistically update tab counts based on current mode
    // Snooze removes the email from the current tab
    if (onTabCountsUpdateOptimistically) {
      if (mode === 'triage') {
        onTabCountsUpdateOptimistically({ triage: -1 });
      } else if (mode === 'action') {
        onTabCountsUpdateOptimistically({ action: -1 });
      } else if (mode === 'follow-up') {
        onTabCountsUpdateOptimistically({ followUp: -1 });
      }
    }

    console.log('[Snooze] Making API call to snooze email');
    // Make API call in background (non-blocking)
    // Note: We don't update tab counts in the .then() callback because:
    // 1. We already optimistically updated the counts above
    // 2. The server processes snooze asynchronously, so fetching counts would return stale data
    axios.post(`${API_URL}/snooze/${emailId}`, { duration })
      .then(() => {
        console.log('[Snooze] API call successful');
      })
      .catch((error) => {
        console.error('[Snooze] API call failed:', error);
        // Revert optimistic update on error - restore email to list and remove from optimistic set
        console.log('[Snooze] Reverting optimistic update');
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
        }
        dispatch(removeOptimisticSnooze(emailId));
        // Revert tab count changes
        if (onTabCountsUpdateOptimistically) {
          if (mode === 'triage') {
            onTabCountsUpdateOptimistically({ triage: 1 });
          } else if (mode === 'action') {
            onTabCountsUpdateOptimistically({ action: 1 });
          } else if (mode === 'follow-up') {
            onTabCountsUpdateOptimistically({ followUp: 1 });
          }
        }
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after snooze error:', err));
        // Re-throw so the caller can show an error message
        throw error;
      });
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, onTabCountsUpdateOptimistically, mode]);

  return {
    handleSetStarCount,
    handleArchive,
    handleSnooze,
  };
}



