import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_NETWORK, ERROR_CODE_ERR_NETWORK, ERROR_GMAIL_REQUIRED, ERROR_GMAIL } from 'constants/strings';
import { InboxMode } from 'types/email';
import { API_URL } from 'config/api';
import { InboxFilter } from 'hooks/useInboxFilters';
import { AppDispatch } from 'store/store';
import { setEmails, appendEmails, setHasMore, setTotalCount, setCurrentOffset, setDecrypting, setLoading, setRefreshing, setLoadingModeSwitch, setFetchError } from 'store/slices/emailSlice';
import { selectCurrentOffset } from 'store/selectors/emailSelectors';

const INBOX_PAGE_SIZE = 50;

interface UseEmailFetchingProps {
  mode: InboxMode;
  filters?: InboxFilter;
}

// eslint-disable-next-line max-lines-per-function -- Inbox fetching requires pagination, background prefetch, and error handling
export function useEmailFetching({
  mode,
  filters,
}: UseEmailFetchingProps) {
  const dispatch = useDispatch<AppDispatch>();
  const currentOffset = useSelector(selectCurrentOffset);
  // Prevent concurrent loadMore calls (background prefetch + scroll trigger)
  const isLoadingMoreRef = useRef(false);

  const buildParams = useCallback((offset: number): URLSearchParams => {
    const params = new URLSearchParams();
    params.append('mode', mode);
    params.append('limit', INBOX_PAGE_SIZE.toString());
    params.append('offset', offset.toString());

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

    return params;
  }, [mode, filters]);

  // Note: We no longer filter optimistically archived emails here.
  // Instead, filtering is done at the selector level (selectVisibleEmails) which always
  // has access to the latest Redux state. This fixes the issue where the ref-based
  // approach could have stale values when fetchEmails is called before the useEffect
  // that updates the ref has a chance to run.

  const fetchEmails = useCallback(async () => {
    dispatch(setDecrypting(true));
    dispatch(setFetchError(null));
    dispatch(setCurrentOffset(0));
    isLoadingMoreRef.current = false;
    try {
      const params = buildParams(0);
      // Keep page param for backward compat with controller
      params.append('page', '1');

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      const { emails, total, hasMore } = response.data;
      console.log(`Fetched ${emails.length}/${total} emails for mode: ${mode}, hasMore: ${hasMore}`);

      dispatch(setEmails(emails));
      dispatch(setTotalCount(total));
      dispatch(setHasMore(hasMore));
      dispatch(setCurrentOffset(emails.length));
      dispatch(setDecrypting(false));
      dispatch(setFetchError(null));

      // Background prefetch: silently load the next page so it's ready when user scrolls
      if (hasMore && emails.length > 0) {
        const nextOffset = emails.length;
        isLoadingMoreRef.current = true;
        axios.get(`${API_URL}/emails/inbox?${buildParams(nextOffset).toString()}`)
          .then(({ data }) => {
            const { emails: moreEmails, total: newTotal, hasMore: newHasMore } = data;
            console.log(`Background prefetch: ${moreEmails.length}/${newTotal} emails for mode: ${mode}`);
            dispatch(appendEmails(moreEmails));
            dispatch(setTotalCount(newTotal));
            dispatch(setHasMore(newHasMore));
            dispatch(setCurrentOffset(nextOffset + moreEmails.length));
          })
          .catch(() => {
            // Silently ignore background prefetch errors
          })
          .finally(() => {
            isLoadingMoreRef.current = false;
          });
      }
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
  }, [mode, filters, dispatch, buildParams]);

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const params = buildParams(currentOffset);

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      const { emails, total, hasMore } = response.data;
      console.log(`Loaded more: ${emails.length}/${total} emails for mode: ${mode}, hasMore: ${hasMore}`);

      dispatch(appendEmails(emails));
      dispatch(setTotalCount(total));
      dispatch(setHasMore(hasMore));
      dispatch(setCurrentOffset(currentOffset + emails.length));
    } catch (error: any) {
      console.error('Error loading more emails:', error);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [mode, filters, dispatch, currentOffset, buildParams]);

  return { fetchEmails, loadMore };
}


