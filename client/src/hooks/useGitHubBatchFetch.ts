import { useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { Email, GitHubLink } from 'types/email';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { updateEmail } from 'store/slices/emailSlice';

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 6;

interface GitHubBatchResponseItem {
  links: GitHubLink[];
  pending?: boolean;
}

interface GitHubBatchResponse {
  [emailId: string]: GitHubBatchResponseItem | null;
}

export function useGitHubBatchFetch(emails: Email[], loading: boolean) {
  const dispatch = useDispatch<AppDispatch>();
  const fetchedForRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  const fetchBatchGitHubStatus = useCallback(async (emailIds: string[]): Promise<string[]> => {
    if (emailIds.length === 0) return [];

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await axios.post<GitHubBatchResponse>(
        `${API_URL}/github/batch-status`,
        { emailIds },
        { signal: abortControllerRef.current.signal },
      );

      const responseData = response.data;
      const pendingIds: string[] = [];

      for (const [emailId, metadata] of Object.entries(responseData)) {
        if (metadata && metadata.links && metadata.links.length > 0 && !metadata.pending) {
          dispatch(updateEmail({
            id: emailId,
            updates: { githubMetadata: { links: metadata.links } },
          }));
        }
        if (metadata && metadata.pending) {
          pendingIds.push(emailId);
        }
      }

      return pendingIds;
    } catch (error: unknown) {
      if (axios.isCancel(error)) return [];
      return [];
    }
  }, [dispatch]);

  const startPolling = useCallback((pendingIds: string[]) => {
    if (pendingIds.length === 0 || pollCountRef.current >= MAX_POLL_ATTEMPTS) return;

    pollTimerRef.current = setTimeout(async () => {
      pollCountRef.current += 1;
      const stillPending = await fetchBatchGitHubStatus(pendingIds);
      startPolling(stillPending);
    }, POLL_INTERVAL_MS);
  }, [fetchBatchGitHubStatus]);

  useEffect(() => {
    if (loading || emails.length === 0) return;

    const emailIdsKey = emails.map(e => e.id).sort().join(',');
    if (fetchedForRef.current === emailIdsKey) return;
    fetchedForRef.current = emailIdsKey;
    pollCountRef.current = 0;

    const emailsNeedingGitHub = emails.filter(email => {
      if (!email.githubMetadata?.links || email.githubMetadata.links.length === 0) {
        return false;
      }
      const hasStatus = email.githubMetadata.links.some(link => link.status);
      return !hasStatus;
    });

    if (emailsNeedingGitHub.length > 0) {
      fetchBatchGitHubStatus(emailsNeedingGitHub.map(e => e.id)).then(pendingIds => {
        startPolling(pendingIds);
      });
    }
  }, [emails, loading, fetchBatchGitHubStatus, startPolling]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);
}
