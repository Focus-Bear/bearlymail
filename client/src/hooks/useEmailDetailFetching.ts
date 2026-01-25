import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';
import { useEmailDetailGithub } from 'hooks/useEmailDetailGithub';
import { emailMentionsGitHub } from 'utils/githubUtils';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: string;
  githubMetadata?: {
    links: any[];
  };
}

export function useEmailDetailFetching(emailId: string) {
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  const {
    githubLinks,
    setGithubLinks,
    loadingGithub,
    hasGithubToken,
    fetchGithubInfo,
    refreshGithubInfo,
  } = useEmailDetailGithub(emailId);

  const fetchEmail = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/emails/${emailId}`);
      const emailData = response.data;
      setEmail(emailData);
      
      if (emailData.githubMetadata?.links) {
        setGithubLinks(emailData.githubMetadata.links);
      } else {
        // Only fetch if email mentions GitHub - instant keyword check
        if (emailMentionsGitHub(emailData.subject, emailData.body, emailData.htmlBody)) {
          fetchGithubInfo();
        }
      }
      
      axios.put(`${API_URL}/emails/${emailId}/read`).catch(err => console.error('Error marking as read:', err));
      axios.post(`${API_URL}/emails/${emailId}/accelerate`).catch(err => 
        console.debug('Job acceleration not available:', err.message)
      );
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  }, [emailId, fetchGithubInfo, setGithubLinks]);

  const fetchThreadEmails = useCallback(async () => {
    if (!emailId) return;
    try {
      const response = await axios.get(`${API_URL}/emails/${emailId}/thread`);
      setThreadEmails(response.data || []);
    } catch (error) {
      console.error('Error fetching thread emails:', error);
      setThreadEmails([]);
    }
  }, [emailId]);


  useEffect(() => {
    if (emailId) {
      fetchEmail().then(() => {
        fetchThreadEmails();
        // Note: fetchGithubInfo is called inside fetchEmail when needed
        // Don't call it here to avoid duplicate fetches
      });
    }
  }, [emailId, fetchEmail, fetchThreadEmails]);

  useEffect(() => {
    if (email?.id && threadEmails.length > 0) {
      const mostRecentId = threadEmails[0]?.id;
      const emailToExpand = email.id || mostRecentId;
      setExpandedThreadItems(new Set(emailToExpand ? [emailToExpand] : []));
    }
  }, [email?.id, threadEmails]);

  const toggleThreadItem = (emailId: string) => {
    setExpandedThreadItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  return {
    email,
    setEmail,
    threadEmails,
    expandedThreadItems,
    setExpandedThreadItems,
    loading,
    githubLinks,
    setGithubLinks,
    loadingGithub,
    hasGithubToken,
    refreshGithubInfo,
    toggleThreadItem,
    fetchThreadEmails,
  };
}

