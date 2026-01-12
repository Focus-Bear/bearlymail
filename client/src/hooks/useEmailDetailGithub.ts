import { useState, useCallback } from 'react';
import axios from 'axios';
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from 'constants/numbers';
import { API_URL } from 'config/api';

export function useEmailDetailGithub(emailId: string) {
  const [githubLinks, setGithubLinks] = useState<any[]>([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);

  const fetchGithubInfo = useCallback(async () => {
    if (!emailId) return;
    setLoadingGithub(true);
    try {
      const response = await axios.get(`${API_URL}/github/emails/${emailId}`);
      setGithubLinks(response.data.links || []);
      setHasGithubToken(response.data.hasToken !== false);
    } catch (error: any) {
      console.error('Error fetching GitHub info:', error);
      if (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN) {
        setHasGithubToken(false);
      }
    } finally {
      setLoadingGithub(false);
    }
  }, [emailId]);

  const refreshGithubInfo = useCallback(async () => {
    if (!emailId) return;
    setLoadingGithub(true);
    try {
      const response = await axios.post(`${API_URL}/github/emails/${emailId}/refresh`);
      setGithubLinks(response.data.links || []);
    } catch (error) {
      console.error('Error refreshing GitHub info:', error);
      alert('Failed to refresh GitHub status. Please try again.');
    } finally {
      setLoadingGithub(false);
    }
  }, [emailId]);

  return {
    githubLinks,
    setGithubLinks,
    loadingGithub,
    hasGithubToken,
    fetchGithubInfo,
    refreshGithubInfo,
  };
}


