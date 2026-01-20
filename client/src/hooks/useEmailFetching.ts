import { useCallback, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_NETWORK, ERROR_CODE_ERR_NETWORK, ERROR_GMAIL_REQUIRED, ERROR_GMAIL } from 'constants/strings';
import { Email } from 'types/email';
import { InboxMode } from 'types/email';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { setEmails, setDecrypting, setLoading, setRefreshing, setLoadingModeSwitch, setFetchError } from 'store/slices/emailSlice';
import { selectOptimisticallyArchived } from 'store/selectors/emailSelectors';

interface UseEmailFetchingProps {
  mode: InboxMode;
}

export function useEmailFetching({
  mode,
}: UseEmailFetchingProps) {
  const dispatch = useDispatch<AppDispatch>();
  const optimisticallyArchived = useSelector(selectOptimisticallyArchived);
  
  // Use a ref to always access the LATEST optimisticallyArchived value
  // This prevents stale closure issues when fetchEmails is called during polling
  const optimisticallyArchivedRef = useRef(optimisticallyArchived);
  useEffect(() => {
    optimisticallyArchivedRef.current = optimisticallyArchived;
  }, [optimisticallyArchived]);

  const fetchEmails = useCallback(async () => {
    dispatch(setDecrypting(true));
    dispatch(setFetchError(null));
    try {
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`, response.data);
      const emails = response.data;
      
      // Filter out optimistically archived emails using the REF to get the latest value
      const currentOptimisticArchived = optimisticallyArchivedRef.current;
      const archivedSet = new Set(currentOptimisticArchived);
      console.log('[Archive Filter] Starting filter:', {
        totalEmails: emails.length,
        optimisticArchivedCount: currentOptimisticArchived.length,
        optimisticArchivedIds: currentOptimisticArchived,
      });
      
      const filteredEmails = emails.filter((email: Email) => {
        const shouldFilter = archivedSet.has(email.id);
        if (shouldFilter) {
          console.log('[Archive Filter] Filtering out email:', { id: email.id, subject: email.subject });
        }
        return !shouldFilter;
      });
      
      console.log('[Archive Filter] Filter complete:', {
        before: emails.length,
        after: filteredEmails.length,
        filtered: emails.length - filteredEmails.length,
        optimisticSetSize: currentOptimisticArchived.length,
      });
      
      dispatch(setEmails(filteredEmails));
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
    // Note: optimisticallyArchivedRef is a ref, not a dependency - we read .current inside
  }, [mode, dispatch]);

  return { fetchEmails };
}


