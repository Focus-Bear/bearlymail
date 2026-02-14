import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_NETWORK, ERROR_CODE_ERR_NETWORK, ERROR_GMAIL_REQUIRED, ERROR_GMAIL } from 'constants/strings';
import { InboxMode } from 'types/email';
import { API_URL } from 'config/api';
import { InboxFilter } from 'hooks/useInboxFilters';
import { AppDispatch } from 'store/store';
import { setEmails, setDecrypting, setLoading, setRefreshing, setLoadingModeSwitch, setFetchError } from 'store/slices/emailSlice';

interface UseEmailFetchingProps {
  mode: InboxMode;
  filters?: InboxFilter;
}

export function useEmailFetching({
  mode,
  filters,
}: UseEmailFetchingProps) {
  const dispatch = useDispatch<AppDispatch>();

  // Note: We no longer filter optimistically archived emails here.
  // Instead, filtering is done at the selector level (selectVisibleEmails) which always
  // has access to the latest Redux state. This fixes the issue where the ref-based
  // approach could have stale values when fetchEmails is called before the useEffect
  // that updates the ref has a chance to run.

  const fetchEmails = useCallback(async () => {
    dispatch(setDecrypting(true));
    dispatch(setFetchError(null));
    try {
      // Build query string with filters
      const params = new URLSearchParams();
      params.append('mode', mode);

      if (filters) {
        if (filters.accountIds && filters.accountIds.length > 0) {
          params.append('accounts', filters.accountIds.join(','));
        }
        if (filters.categories && filters.categories.length > 0) {
          params.append('categories', filters.categories.join(','));
        }
        if (filters.minPriority !== null && filters.minPriority !== undefined) {
          params.append('minPriority', filters.minPriority.toString());
        }
      }

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`);
      const emails = response.data;
      
      // Set all emails - filtering of optimistically archived/snoozed emails
      // is now done at the selector level (selectVisibleEmails) to ensure
      // we always use the latest Redux state
      dispatch(setEmails(emails));
      dispatch(setDecrypting(false));
      dispatch(setFetchError(null));
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      dispatch(setDecrypting(false));
      // eslint-disable-next-line no-restricted-syntax -- Error code comparison requires literal string for axios error codes
      if (error.code === ERROR_CODE_ERR_NETWORK || error.message?.includes(ERROR_NETWORK)) {
        dispatch(setFetchError('Unable to connect to the server. Please check if the server is running.'));
      } else if (error.response?.status === HTTP_UNAUTHORIZED) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes(ERROR_GMAIL_REQUIRED) || errorMessage.includes(ERROR_GMAIL)) {
          dispatch(setFetchError('GMAIL_REQUIRED')); // Special error code for Gmail requirement
        } else {
          dispatch(setFetchError('Please log in again to view emails.'));
        }
      } else {
        dispatch(setFetchError(error.response?.data?.message || error.message || 'Failed to load emails. Please try again.'));
      }
    } finally {
      dispatch(setLoading(false));
      dispatch(setRefreshing(false));
      dispatch(setLoadingModeSwitch(false));
    }
  }, [mode, filters, dispatch]);

  return { fetchEmails };
}


