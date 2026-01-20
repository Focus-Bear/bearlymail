import { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from 'constants/numbers';
import { API_URL } from 'config/api';

// Helper to deduplicate links
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

  const fetchGithubInfo = useCallback(async () => {
    if (!emailId) return;
    
    // Don't fetch if we already fetched for this email
    if (fetchedRef.current === emailId) return;
    fetchedRef.current = emailId;
    
    setLoadingGithub(true);
    try {
      const response = await axios.get(`${API_URL}/github/emails/${emailId}`);
      // Only update if still on same email
      if (fetchedRef.current === emailId) {
        setGithubLinks(deduplicateLinks(response.data.links || []));
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: any) {
      if (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN) {
        setHasGithubToken(false);
      }
    } finally {
      if (fetchedRef.current === emailId) {
        setLoadingGithub(false);
      }
    }
  }, [emailId]);

  const refreshGithubInfo = useCallback(async () => {
    if (!emailId) return;
    // Reset the fetch ref so we can force a refresh
    fetchedRef.current = null;
    setLoadingGithub(true);
    try {
      const response = await axios.post(`${API_URL}/github/emails/${emailId}/refresh`);
      fetchedRef.current = emailId;
      setGithubLinks(deduplicateLinks(response.data.links || []));
    } catch (error) {
      console.error('Error refreshing GitHub info:', error);
      alert('Failed to refresh GitHub status. Please try again.');
    } finally {
      setLoadingGithub(false);
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


