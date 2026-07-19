import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useUserProfileQuery } from 'queries/useUserProfileQuery';
import { GitHubLink } from 'types/email';

import { API_URL } from 'config/api';
import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from 'constants/numbers';

const deduplicateLinks = (links: GitHubLink[]): GitHubLink[] => {
  const seen = new Set<string>();
  return links.filter(link => {
    const key = link.url || `${link.owner}-${link.repo}-${link.number}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

function useEmailChangeReset(
  emailId: string,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  fetchedRef: React.MutableRefObject<string | null>,
  resetState: () => void
) {
  const previousEmailIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousEmailIdRef.current !== null && previousEmailIdRef.current !== emailId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      resetState();
      fetchedRef.current = null;
    }
    previousEmailIdRef.current = emailId;
  }, [emailId, abortControllerRef, fetchedRef, resetState]);
}

export function useEmailDetailGithub(emailId: string) {
  const { data: userProfile } = useUserProfileQuery();
  const [githubLinks, setGithubLinks] = useState<GitHubLink[]>([]);
  const [loadingGithub, setLoadingGithub] = useState(true);
  const [hasGithubToken, setHasGithubToken] = useState(() => !!userProfile?.githubToken);
  const fetchedRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync hasGithubToken when the cached user profile arrives or changes.
  // This ensures the token state updates even if the hook mounts before the
  // profile query resolves (same pattern as useApiKeys.ts lines 49-54).
  useEffect(() => {
    if (userProfile) {
      setHasGithubToken(!!userProfile.githubToken);
    }
  }, [userProfile]);

  const resetGithubState = useCallback(() => {
    setGithubLinks([]);
    setLoadingGithub(false);
  }, []);

  useEmailChangeReset(emailId, abortControllerRef, fetchedRef, resetGithubState);

  const fetchGithubInfo = useCallback(async () => {
    if (!emailId) {
      return;
    }

    if (fetchedRef.current === emailId) {
      return;
    }
    fetchedRef.current = emailId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingGithub(true);
    try {
      const response = await axios.get(`${API_URL}/github/emails/${emailId}`, { signal: controller.signal });
      if (fetchedRef.current === emailId && !controller.signal.aborted) {
        const links = deduplicateLinks(response.data.links || []);
        setGithubLinks(links);
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: unknown) {
      if (axios.isCancel(error)) {
        return;
      }
      if (
        axios.isAxiosError(error) &&
        (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN)
      ) {
        setHasGithubToken(false);
      }
    } finally {
      if (fetchedRef.current === emailId && !controller.signal.aborted) {
        setLoadingGithub(false);
      }
    }
  }, [emailId]);

  const refreshGithubInfo = useCallback(async () => {
    if (!emailId) {
      return;
    }
    fetchedRef.current = null;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingGithub(true);
    try {
      const response = await axios.post(
        `${API_URL}/github/emails/${emailId}/refresh`,
        {},
        { signal: controller.signal }
      );
      if (!controller.signal.aborted) {
        fetchedRef.current = emailId;
        const links = deduplicateLinks(response.data.links || []);
        setGithubLinks(links);
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        return;
      }
      console.error('Error refreshing GitHub info:', error);
      alert('Failed to refresh GitHub status. Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setLoadingGithub(false);
      }
    }
  }, [emailId]);

  const setGithubLinksWithDedup = useCallback(
    (links: GitHubLink[]) => {
      setGithubLinks(deduplicateLinks(links));
      fetchedRef.current = emailId;
    },
    [emailId]
  );

  return {
    githubLinks,
    setGithubLinks: setGithubLinksWithDedup,
    loadingGithub,
    hasGithubToken,
    fetchGithubInfo,
    refreshGithubInfo,
  };
}
