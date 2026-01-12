import { useCallback } from 'react';
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
  const fetchEmails = useCallback(async () => {
    dispatch(setDecrypting(true));
    dispatch(setFetchError(null));
    try {
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`, response.data);
      let enrichedEmails = response.data;
      
      // Enrich emails with metadata (action items count, note status)
      // Do this in parallel for better performance
      const enrichmentPromises = enrichedEmails.map(async (email: Email) => {
        const [actionItemsResponse, noteResponse] = await Promise.allSettled([
          // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
          axios.get(`${API_URL}/action-items?emailId=${email.id}`).catch(() => ({ data: [] })),
          // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
          email.threadId ? axios.get(`${API_URL}/notes/thread/${email.threadId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        ]);
        
        // eslint-disable-next-line id-denylist, no-restricted-syntax -- 'data' is a standard property in Axios responses; 'fulfilled' is a standard Promise.allSettled status
        const actionItems = actionItemsResponse.status === 'fulfilled' ? actionItemsResponse.value.data : [];
        // eslint-disable-next-line id-denylist, no-restricted-syntax -- 'data' is a standard property in Axios responses; 'fulfilled' is a standard Promise.allSettled status
        const note = noteResponse.status === 'fulfilled' ? noteResponse.value.data : null;
        
        return {
          ...email,
          actionItemsCount: Array.isArray(actionItems) ? actionItems.length : 0,
          hasPrivateNote: !!note,
        };
      });
      
      enrichedEmails = await Promise.all(enrichmentPromises);
      
      // Filter out optimistically archived emails
      const archivedSet = new Set(optimisticallyArchived);
      console.log('[Archive Filter] Starting filter:', {
        totalEmails: enrichedEmails.length,
        optimisticArchivedCount: optimisticallyArchived.length,
        optimisticArchivedIds: optimisticallyArchived,
      });
      
      const filteredEmails = enrichedEmails.filter((email: Email) => {
        const shouldFilter = archivedSet.has(email.id);
        if (shouldFilter) {
          console.log('[Archive Filter] Filtering out email:', { id: email.id, subject: email.subject });
        }
        return !shouldFilter;
      });
      
      console.log('[Archive Filter] Filter complete:', {
        before: enrichedEmails.length,
        after: filteredEmails.length,
        filtered: enrichedEmails.length - filteredEmails.length,
        optimisticSetSize: optimisticallyArchived.length,
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
  }, [mode, dispatch, optimisticallyArchived]);

  return { fetchEmails };
}


