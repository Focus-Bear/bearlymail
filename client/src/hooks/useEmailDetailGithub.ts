import { useCallback, useEffect,useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { HTTP_FORBIDDEN,HTTP_UNAUTHORIZED } from 'constants/numbers';

const deduplicateLinks = (links: any[]): any[] => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url || `${link.owner}-${link.repo}-${link.number}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function useEmailDetailGithub(emailId: string) {
  const [githubLinks, setGithubLinks] = useState<any[]>([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousEmailIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousEmailIdRef.current !== null && previousEmailIdRef.current !== emailId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGithubLinks([]);
      setLoadingGithub(false);
      fetchedRef.current = null;
    }
    previousEmailIdRef.current = emailId;
  }, [emailId]);

  const fetchGithubInfo = useCallback(async () => {
    if (!emailId) return;

    if (fetchedRef.current === emailId) return;
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
        setGithubLinks(deduplicateLinks(response.data.links || []));
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return;
      }
      if (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN) {
        setHasGithubToken(false);
      }
    } finally {
      if (fetchedRef.current === emailId && !controller.signal.aborted) {
        setLoadingGithub(false);
      }
    }
  }, [emailId]);

  const refreshGithubInfo = useCallback(async () => {
    if (!emailId) return;
    fetchedRef.current = null;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingGithub(true);
    try {
      const response = await axios.post(`${API_URL}/github/emails/${emailId}/refresh`, {}, { signal: controller.signal });
      if (!controller.signal.aborted) {
        fetchedRef.current = emailId;
        setGithubLinks(deduplicateLinks(response.data.links || []));
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

  // Reset when email changes
  const setGithubLinksWithDedup = useCallback((links: any[]) => {
    setGithubLinks(deduplicateLinks(links));
    fetchedRef.current = emailId; // Mark as having data
  }, [emailId]);

  return {
    githubLinks,
    setGithubLinks: setGithubLinksWithDedup,
    loadingGithub,
    hasGithubToken,
    fetchGithubInfo,
    refreshGithubInfo,
  };
}


