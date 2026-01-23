import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_PRIORITY_SCORE } from 'constants/numbers';
import axios from 'axios';
import { Email, getEmailPriorityScore } from 'types/email';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { removeEmail, updateEmail, restoreEmail, addOptimisticArchive, removeOptimisticArchive, addOptimisticSnooze, removeOptimisticSnooze } from 'store/slices/emailSlice';
import { selectEmails } from 'store/selectors/emailSelectors';

interface UseEmailActionsBaseProps {
  fetchEmails: () => Promise<void>;
  onSuggestionRemove?: (emailId: string) => void;
  onShowPriorityOverride?: (emailId: string, originalPriorityScore: number, newPriorityScore: number, context?: 'archive' | 'star' | 'manual') => void;
  onTabCountsUpdate?: (forceRefresh?: boolean) => void;
  mode?: string;
}

export function useEmailActionsBase({
  fetchEmails,
  onSuggestionRemove,
  onShowPriorityOverride,
  onTabCountsUpdate,
  mode,
}: UseEmailActionsBaseProps) {
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);
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
      dispatch(removeEmail(emailId));
      onSuggestionRemove?.(emailId);
      // Update tab counts to reflect the change
      if (onTabCountsUpdate) {
        onTabCountsUpdate(true);
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
    axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount })
      .then(() => {
        // Update tab counts after successful star update
        if (onTabCountsUpdate) {
          onTabCountsUpdate(true);
        }
      })
      .catch((error) => {
        console.error('Error setting star count:', error);
        // Revert optimistic update on error - restore email to list or star count
        if (mode === 'triage' && starCount > 0 && email) {
          dispatch(restoreEmail(email));
        } else {
          dispatch(updateEmail({ id: emailId, updates: { starCount: originalStarCount } }));
        }
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after star update error:', err));
      });

    // Return immediately without waiting for API
    return result;
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, mode, onTabCountsUpdate]);

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
    if (!emailToArchive.isRead && priorityScore > 20 && onShowPriorityOverride) {
      // Show priority override modal with archive context - user will archive after submitting
      onShowPriorityOverride(emailId, priorityScore, 0, 'archive'); // 0 = low priority (archiving)
      return;
    }
    
    // Optimistic update - remove from list immediately and add to optimistic archive set
    // This way, even if fetchEmails() runs, the email won't show because it's filtered out
    console.log('[Archive] Dispatching removeEmail and addOptimisticArchive');
    dispatch(removeEmail(emailId));
    dispatch(addOptimisticArchive(emailId));
    onSuggestionRemove?.(emailId);

    console.log('[Archive] Making API call to archive email');
    // Make API call in background (non-blocking)
    axios.put(`${API_URL}/emails/${emailId}/archive`)
      .then((response) => {
        console.log('[Archive] API call successful:', response.data);
        // After successful archive, keep it in optimistic set - it will be filtered out anyway
        // No need to call fetchEmails() - the optimistic update is sufficient
        // Update tab counts to reflect the archived email (force refresh to bypass cache)
        if (onTabCountsUpdate) {
          onTabCountsUpdate(true);
        }
      })
      .catch((error) => {
        console.error('[Archive] API call failed:', error);
        // Revert optimistic update on error - restore email to list and remove from optimistic set
        console.log('[Archive] Reverting optimistic update');
        if (emailToArchive) {
          dispatch(restoreEmail(emailToArchive));
        }
        dispatch(removeOptimisticArchive(emailId));
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after archive error:', err));
      });
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, onShowPriorityOverride, onTabCountsUpdate]);

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

    console.log('[Snooze] Making API call to snooze email');
    // Make API call in background (non-blocking)
    axios.post(`${API_URL}/snooze/${emailId}`, { duration })
      .then(() => {
        console.log('[Snooze] API call successful');
        // Update tab counts to reflect the snoozed email
        if (onTabCountsUpdate) {
          onTabCountsUpdate(true);
        }
      })
      .catch((error) => {
        console.error('[Snooze] API call failed:', error);
        // Revert optimistic update on error - restore email to list and remove from optimistic set
        console.log('[Snooze] Reverting optimistic update');
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
        }
        dispatch(removeOptimisticSnooze(emailId));
        // Only refresh on error to sync state
        fetchEmails().catch(err => console.error('Error refreshing after snooze error:', err));
        // Re-throw so the caller can show an error message
        throw error;
      });
  }, [emails, fetchEmails, onSuggestionRemove, dispatch, onTabCountsUpdate]);

  return {
    handleSetStarCount,
    handleArchive,
    handleSnooze,
  };
}



