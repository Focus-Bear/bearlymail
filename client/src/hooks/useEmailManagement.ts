import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { TYPEOF_FUNCTION } from 'constants/strings';
import { useEmailActionsBase } from 'hooks/useEmailActionsBase';
import { useEmailFetching } from 'hooks/useEmailFetching';
import { InboxFilter } from 'hooks/useInboxFilters';
import {
  selectCategorySummary,
  selectDecrypting,
  selectFetchError,
  selectHasMore,
  selectLoadedCategoryNames,
  selectLoading,
  selectLoadingCategoryNames,
  selectLoadingModeSwitch,
  selectRefreshing,
  selectVisibleEmails,
} from 'store/selectors/emailSelectors';
import {
  setEmails as setEmailsAction,
  setLoadingModeSwitch as setLoadingModeSwitchAction,
  setRefreshing,
  updateEmail,
} from 'store/slices/emailSlice';
import { CategorySummaryItem } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

type BulkReadParams = {
  emailIds: string[];
  isRead: boolean;
  dispatch: AppDispatch;
  fetchEmails: () => Promise<void>;
  onSuggestionRemove?: (emailId: string) => void;
};

async function bulkMarkReadUnread({
  emailIds,
  isRead,
  dispatch,
  fetchEmails,
  onSuggestionRemove,
}: BulkReadParams): Promise<void> {
  if (emailIds.length === 0) {
    return;
  }
  emailIds.forEach(id => {
    dispatch(updateEmail({ id, updates: { isRead } }));
  });
  if (onSuggestionRemove) {
    emailIds.forEach(id => onSuggestionRemove(id));
  }
  const endpoint = isRead ? 'read' : 'unread';
  try {
    await axios.post(`${API_URL}/emails/bulk/${endpoint}`, { emailIds });
    fetchEmails().catch(err => console.error(`Error refreshing after bulk ${endpoint}:`, err));
  } catch (error) {
    console.error(`Error bulk marking emails as ${endpoint}:`, error);
    fetchEmails();
  }
}

interface TabCountChanges {
  triage?: number;
  action?: number;
  followUp?: number;
}

interface UseEmailManagementProps {
  mode: InboxMode;
  onSuggestionRemove?: (emailId: string) => void;
  onTabCountsUpdateOptimistically?: (changes: TabCountChanges) => void;
  filters?: InboxFilter;
}

interface UseEmailManagementReturn {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  setLoadingModeSwitch: React.Dispatch<React.SetStateAction<boolean>>;
  fetchError: string | null;
  fetchEmails: () => Promise<void>;
  refreshInPlace: () => Promise<void>;
  loadMore: () => Promise<void>;
  fetchCategoryEmails: (categoryName: string) => Promise<void>;
  hasMore: boolean;
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  handleSetStarCount: (
    emailId: string,
    starCount: number,
    e?: React.MouseEvent
  ) => Promise<{ discrepancy: number; predictedStarCount: number } | null>;
  handleArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleSnooze: (emailId: string, duration: string) => Promise<void>;
  handleMarkAsRead: (emailId: string) => Promise<void>;
  handleMarkAsUnread: (emailId: string) => Promise<void>;
  handleBulkMarkAsRead: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread: (emailIds: string[]) => Promise<void>;
  handleCheckUrgent: () => Promise<{ hasUrgent: boolean; count: number; emails: any[] }>;
}

export function useEmailManagement({
  mode,
  onSuggestionRemove,
  onTabCountsUpdateOptimistically,
  filters,
}: UseEmailManagementProps): UseEmailManagementReturn {
  const dispatch = useDispatch<AppDispatch>();
  // selectVisibleEmails filters out optimistically archived/snoozed emails from Redux state
  const emails = useSelector(selectVisibleEmails);
  const loading = useSelector(selectLoading);
  const decrypting = useSelector(selectDecrypting);
  const refreshing = useSelector(selectRefreshing);
  const loadingModeSwitch = useSelector(selectLoadingModeSwitch);
  const fetchError = useSelector(selectFetchError);

  const hasMore = useSelector(selectHasMore);
  const categorySummary = useSelector(selectCategorySummary);
  const loadedCategoryNames = useSelector(selectLoadedCategoryNames);
  const loadingCategoryNames = useSelector(selectLoadingCategoryNames);
  const { fetchEmails, loadMore, fetchCategoryEmails, refreshInPlace } = useEmailFetching({ mode, filters });

  const { handleSetStarCount, handleArchive, handleSnooze } = useEmailActionsBase({
    fetchEmails,
    onSuggestionRemove,
    onTabCountsUpdateOptimistically,
    mode,
  });

  const handleMarkAsRead = useCallback(
    async (emailId: string) => {
      try {
        await axios.put(`${API_URL}/emails/${emailId}/read`);
        dispatch(updateEmail({ id: emailId, updates: { isRead: true } }));
      } catch (error) {
        console.error('Error marking email as read:', error);
      }
    },
    [dispatch]
  );

  const handleMarkAsUnread = useCallback(
    async (emailId: string) => {
      try {
        await axios.put(`${API_URL}/emails/${emailId}/unread`);
        dispatch(updateEmail({ id: emailId, updates: { isRead: false } }));
      } catch (error) {
        console.error('Error marking email as unread:', error);
      }
    },
    [dispatch]
  );

  const handleBulkMarkAsRead = useCallback(
    (emailIds: string[]) => bulkMarkReadUnread({ emailIds, isRead: true, dispatch, fetchEmails, onSuggestionRemove }),
    [fetchEmails, onSuggestionRemove, dispatch]
  );

  const handleBulkMarkAsUnread = useCallback(
    (emailIds: string[]) => bulkMarkReadUnread({ emailIds, isRead: false, dispatch, fetchEmails, onSuggestionRemove }),
    [fetchEmails, onSuggestionRemove, dispatch]
  );

  const handleCheckUrgent = useCallback(async () => {
    dispatch(setRefreshing(true));
    try {
      const response = await axios.post(`${API_URL}/emails/check-urgent`);
      return {
        hasUrgent: response.data.hasUrgent,
        count: response.data.urgentCount || 0,
        emails: response.data.urgentEmails || [],
      };
    } catch (error) {
      console.error('Error checking for urgent emails:', error);
      return { hasUrgent: false, count: 0, emails: [] };
    } finally {
      dispatch(setRefreshing(false));
    }
  }, [dispatch]);

  // setEmails is kept for backward compatibility but now dispatches to Redux
  const setEmails = useCallback(
    (action: React.SetStateAction<Email[]>) => {
      if (typeof action === TYPEOF_FUNCTION) {
        const newEmails = action(emails);
        dispatch(setEmailsAction(newEmails));
      } else {
        dispatch(setEmailsAction(action));
      }
    },
    [dispatch, emails]
  );

  // setLoadingModeSwitch is kept for backward compatibility
  const setLoadingModeSwitch = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (typeof value === TYPEOF_FUNCTION) {
        dispatch(setLoadingModeSwitchAction(value(loadingModeSwitch)));
      } else {
        dispatch(setLoadingModeSwitchAction(value));
      }
    },
    [dispatch, loadingModeSwitch]
  );

  return {
    emails,
    setEmails,
    loading,
    decrypting,
    refreshing,
    loadingModeSwitch,
    setLoadingModeSwitch,
    fetchError,
    fetchEmails,
    refreshInPlace,
    loadMore,
    fetchCategoryEmails,
    hasMore,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    handleSetStarCount,
    handleArchive,
    handleSnooze,
    handleMarkAsRead,
    handleMarkAsUnread,
    handleBulkMarkAsRead,
    handleBulkMarkAsUnread,
    handleCheckUrgent,
  };
}
