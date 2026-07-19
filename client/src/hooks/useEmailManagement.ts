import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { useEmailActionsBase } from 'hooks/useEmailActionsBase';
import { useEmailFetching } from 'hooks/useEmailFetching';
import { InboxFilter } from 'hooks/useInboxFilters';
import {
  selectCategorySummary,
  selectDecrypting,
  selectExhaustedCategoryNames,
  selectFetchError,
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
  fetchEmails: (
    signalOrOverride?: AbortSignal | Partial<InboxFilter>,
    overrideFilters?: Partial<InboxFilter>
  ) => Promise<void>;
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
    fetchEmails().catch(err => console.error(`Error refreshing after bulk ${endpoint}:`, err)); // nosemgrep
  } catch (error) {
    console.error(`Error bulk marking emails as ${endpoint}:`, error); // nosemgrep
    fetchEmails();
  }
}

interface EmailReduxState {
  emails: Email[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  fetchError: string | null;
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames: string[];
}

function useEmailReduxState(): EmailReduxState {
  return {
    emails: useSelector(selectVisibleEmails),
    loading: useSelector(selectLoading),
    decrypting: useSelector(selectDecrypting),
    refreshing: useSelector(selectRefreshing),
    loadingModeSwitch: useSelector(selectLoadingModeSwitch),
    fetchError: useSelector(selectFetchError),
    categorySummary: useSelector(selectCategorySummary),
    loadedCategoryNames: useSelector(selectLoadedCategoryNames),
    loadingCategoryNames: useSelector(selectLoadingCategoryNames),
    exhaustedCategoryNames: useSelector(selectExhaustedCategoryNames),
  };
}

function applyEmailStateUpdate(
  action: React.SetStateAction<Email[]>,
  currentEmails: Email[],
  dispatch: AppDispatch
): void {
  if (typeof action === 'function') {
    dispatch(setEmailsAction(action(currentEmails)));
  } else {
    dispatch(setEmailsAction(action));
  }
}

function applyLoadingModeSwitchUpdate(
  value: boolean | ((prev: boolean) => boolean),
  currentValue: boolean,
  dispatch: AppDispatch
): void {
  if (typeof value === 'function') {
    dispatch(setLoadingModeSwitchAction(value(currentValue)));
  } else {
    dispatch(setLoadingModeSwitchAction(value));
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
  onEmailMoved?: (emailId: string) => void;
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
  fetchEmails: (
    signalOrOverride?: AbortSignal | Partial<InboxFilter>,
    overrideFilters?: Partial<InboxFilter>
  ) => Promise<void>;
  refreshInPlace: () => Promise<void>;
  fetchCategoryEmails: (categoryName: string) => Promise<void>;
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames: string[];
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
  handleCheckUrgent: () => Promise<{ hasUrgent: boolean; count: number; emails: Email[] }>;
}

export function useEmailManagement(props: UseEmailManagementProps): UseEmailManagementReturn {
  const { mode, onSuggestionRemove, onTabCountsUpdateOptimistically, onEmailMoved, filters } = props;
  const dispatch = useDispatch<AppDispatch>();
  const {
    emails,
    loading,
    decrypting,
    refreshing,
    loadingModeSwitch,
    fetchError,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
  } = useEmailReduxState();

  const { fetchEmails, fetchCategoryEmails, refreshInPlace } = useEmailFetching({ mode, filters });
  const { handleSetStarCount, handleArchive, handleSnooze } = useEmailActionsBase({
    fetchEmails,
    onSuggestionRemove,
    onTabCountsUpdateOptimistically,
    onEmailMoved,
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

  const setEmails = useCallback(
    (action: React.SetStateAction<Email[]>) => applyEmailStateUpdate(action, emails, dispatch),
    [dispatch, emails]
  );

  const setLoadingModeSwitch = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => applyLoadingModeSwitchUpdate(value, loadingModeSwitch, dispatch),
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
    fetchCategoryEmails,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
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
