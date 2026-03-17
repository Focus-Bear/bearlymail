import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import axios from 'axios';
import { emailMentionsGitHub } from 'utils/githubUtils';

import { API_URL } from 'config/api';
import { useEmailDetailGithub } from 'hooks/useEmailDetailGithub';

interface Email {
  id: string;
  threadId: string;
  emailThreadId?: string;
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

async function fetchThreadEmailsForId(
  emailId: string,
  setThreadEmails: (emails: Email[]) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!emailId) {
    return;
  }
  try {
    const response = await axios.get(`${API_URL}/emails/${emailId}/thread`, { signal });
    setThreadEmails(response.data || []);
  } catch (error) {
    if (axios.isCancel(error)) {
      return;
    }
    console.error('Error fetching thread emails:', error);
    setThreadEmails([]);
  }
}

function toggleThreadItemInSet(prev: Set<string>, itemId: string): Set<string> {
  const newSet = new Set(prev);
  if (newSet.has(itemId)) {
    newSet.delete(itemId);
  } else {
    newSet.add(itemId);
  }
  return newSet;
}

function triggerEmailSideEffects(emailId: string, emailThreadId?: string): void {
  axios.put(`${API_URL}/emails/${emailId}/read`).catch(err => console.error('Error marking as read:', err));
  axios
    .post(`${API_URL}/emails/${emailId}/accelerate`)
    .catch(err => console.debug('Job acceleration not available:', err.message));
  if (emailThreadId) {
    axios
      .post(`${API_URL}/suggested-replies/${emailThreadId}/ensure`)
      .catch(err => console.debug('Suggested reply generation not triggered:', err.message));
  }
}

export function useEmailDetailFetching(emailId: string) {
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);

  const { githubLinks, setGithubLinks, loadingGithub, hasGithubToken, fetchGithubInfo, refreshGithubInfo } =
    useEmailDetailGithub(emailId);

  const fetchGithubInfoRef = useRef(fetchGithubInfo);
  const setGithubLinksRef = useRef(setGithubLinks);
  fetchGithubInfoRef.current = fetchGithubInfo;
  setGithubLinksRef.current = setGithubLinks;

  const fetchEmail = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/emails/${emailId}`, { signal });
        const emailData = response.data;
        setEmail(emailData);

        if (emailData.githubMetadata?.links) {
          setGithubLinksRef.current(emailData.githubMetadata.links);
        } else {
          if (emailMentionsGitHub(emailData.subject, emailData.body, emailData.htmlBody)) {
            fetchGithubInfoRef.current();
          }
        }

        triggerEmailSideEffects(emailId, emailData.emailThreadId);
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }
        console.error('Error fetching email:', error);
      } finally {
        setLoading(false);
      }
    },
    [emailId]
  );

  const fetchThreadEmails = useCallback(
    (signal?: AbortSignal) => fetchThreadEmailsForId(emailId, setThreadEmails, signal),
    [emailId]
  );

  const onEmailIdChanged = useEffectEvent((id: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setEmail(null);
    setThreadEmails([]);

    fetchEmail(controller.signal).then(() => {
      if (!controller.signal.aborted) {
        fetchThreadEmails(controller.signal);
      }
    });
  });

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (emailId) {
      onEmailIdChanged(emailId);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [emailId, onEmailIdChanged]);

  const expandedItemsSetRef = useRef<string | null>(null);
  useEffect(() => {
    if (email?.id && threadEmails.length > 0) {
      const mostRecentId = threadEmails[0]?.id;
      const emailToExpand = email.id || mostRecentId;
      if (emailToExpand && expandedItemsSetRef.current !== emailToExpand) {
        expandedItemsSetRef.current = emailToExpand;
        setExpandedThreadItems(new Set([emailToExpand]));
      }
    }
  }, [email?.id, threadEmails]);

  const toggleThreadItem = (itemId: string) => {
    setExpandedThreadItems(prev => toggleThreadItemInSet(prev, itemId));
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
