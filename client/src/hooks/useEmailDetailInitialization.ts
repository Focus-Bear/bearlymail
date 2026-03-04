import { MutableRefObject, useEffect, useRef } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { SUMMARY_TYPE_TLDR } from 'constants/strings';

// Pure helper: applies the best-matching summarization rule (or fallback) for an email.
function applyMatchedRule(
  matchedRule: any,
  rulesList: any[],
  id: string,
  initializedRef: MutableRefObject<string | null>,
  handleUseCustomRule: (rule: any) => void,
  handleSummarize: (type: string) => void,
): void {
  const validRule = (r: any) => r?.ruleId && r?.whenToUse && r?.howToSummarize;
  const ruleToApply = validRule(matchedRule) ? matchedRule : rulesList.find(validRule);
  initializedRef.current = id;
  if (ruleToApply) {
    handleUseCustomRule(ruleToApply);
  } else {
    handleSummarize('tldr');
  }
}

interface UseEmailDetailInitializationProps {
  id: string | undefined;
  email: any;
  isGeneratingSummary: boolean;
  summaryType: string;
  summary: string | null;
  fetchCustomRules: () => Promise<any[]>;
  fetchEmail: () => Promise<any>;
  fetchGithubInfo: () => Promise<void>;
  fetchSuggestedActions: () => Promise<void>;
  fetchNote: () => Promise<void>;
  fetchThreadEmails: () => Promise<void>;
  handleUseCustomRule: (rule: any) => Promise<void>;
  handleSummarize: (type: string) => Promise<void>;
  setSummary: (summary: string | null) => void;
  setSummaryType: (type: string) => void;
  setSummaryCollapsed: (collapsed: boolean) => void;
  setActionItems: (items: any[]) => void;
  setExpandedThreadItems: (items: Set<string>) => void;
  setThreadEmails: (emails: any[]) => void;
  setLoading: (loading: boolean) => void;
  setEmail: (email: any) => void;
  threadEmails: any[];
  actionItems: any[];
}

export const useEmailDetailInitialization = ({
  id,
  email,
  isGeneratingSummary,
  summaryType,
  summary,
  fetchCustomRules,
  fetchEmail,
  fetchGithubInfo,
  fetchSuggestedActions,
  fetchNote,
  fetchThreadEmails,
  handleUseCustomRule,
  handleSummarize,
  setSummary,
  setSummaryType,
  setSummaryCollapsed,
  setActionItems,
  setExpandedThreadItems,
  setThreadEmails,
  setLoading,
  setEmail,
  threadEmails,
  actionItems,
}: UseEmailDetailInitializationProps) => {
  // Track which email ID we've initialized to prevent re-initialization
  const initializedEmailIdRef = useRef<string | null>(null);
  const previousEmailIdRef = useRef<string | undefined>(undefined);
  // Track which email ID we've fetched data for
  const fetchedEmailIdRef = useRef<string | null>(null);
  // Track which thread we've fetched data for
  const fetchedThreadIdRef = useRef<string | null>(null);
  // Track which thread we've set expanded items for
  const expandedItemsSetRef = useRef<string | null>(null);
  // Track which email we've auto-extracted actions for
  const autoExtractedRef = useRef<string | null>(null);
  
  // Clear summary and reset state when email ID changes to prevent showing old data
  useEffect(() => {
    if (id && id !== previousEmailIdRef.current) {
      // Email ID changed, show loading state and clear all stale data
      setLoading(true);
      setEmail(null); // Clear email to show loading spinner
      setSummary(null);
      setSummaryType(SUMMARY_TYPE_TLDR); // Reset to default type
      setThreadEmails([]); // Clear thread emails to prevent showing stale content
      setExpandedThreadItems(new Set()); // Clear expanded state
      setActionItems([]); // Clear action items
      // Reset initialization and fetch tracking for the new email
      initializedEmailIdRef.current = null;
      fetchedEmailIdRef.current = null;
      fetchedThreadIdRef.current = null;
      expandedItemsSetRef.current = null;
      autoExtractedRef.current = null;
      previousEmailIdRef.current = id;
    }
  }, [id, setSummary, setSummaryType, setThreadEmails, setExpandedThreadItems, setActionItems, setLoading, setEmail]);
  
  // Track manual summaryType changes
  useEffect(() => {
    if (id && summaryType !== SUMMARY_TYPE_TLDR && initializedEmailIdRef.current !== id) {
      // User has manually selected a different summary type for the current email, mark as initialized
      initializedEmailIdRef.current = id;
    }
  }, [id, summaryType]);
  
  useEffect(() => {
    // Only fetch if we have an ID and haven't already fetched for this email
    if (!id || fetchedEmailIdRef.current === id) {
      return;
    }
    
    // Mark as fetched immediately to prevent duplicate calls
    fetchedEmailIdRef.current = id;
    
    fetchCustomRules().then((rules) => {
      fetchEmail().then(async (emailData) => {
        // Only auto-select if:
        // 1. We haven't initialized for this email yet
        // 2. No summary exists yet (neither in state nor from API)
        // 3. Email is not processing summary
        // 4. We're not currently generating summary
        // 5. SummaryType is still the default ('tldr') - meaning user hasn't manually selected yet
        const shouldAutoSelect = 
          initializedEmailIdRef.current !== id &&
          emailData && 
          !emailData.summary && 
          !emailData.isProcessingSummary && 
          !isGeneratingSummary &&
          !summary &&
          summaryType === SUMMARY_TYPE_TLDR;
        
        if (shouldAutoSelect) {
          const rulesList = rules || [];
          
          if (rulesList.length > 0) {
            try {
              const response = await axios.post(`${API_URL}/summarize/match-rule/${id}`);
              applyMatchedRule(response.data?.rule, rulesList, id, initializedEmailIdRef, handleUseCustomRule, handleSummarize);
            } catch (error) {
              console.error('Error matching rule, using first rule:', error);
              applyMatchedRule(null, rulesList, id, initializedEmailIdRef, handleUseCustomRule, handleSummarize);
            }
          } else {
            initializedEmailIdRef.current = id;
            handleSummarize(SUMMARY_TYPE_TLDR);
          }
        } else if (emailData && emailData.summary && !summary) {
          // Email already has a summary from the server, use it
          setSummary(emailData.summary);
          setSummaryType(SUMMARY_TYPE_TLDR);
          setSummaryCollapsed(false);
          initializedEmailIdRef.current = id;
        }
      });
    });
    fetchGithubInfo();
    fetchSuggestedActions();
    // Note: We intentionally don't include summary/summaryType/isGeneratingSummary in deps
    // as these can change after initial fetch and would cause re-fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fetchCustomRules, fetchEmail, handleUseCustomRule, handleSummarize, fetchGithubInfo, fetchSuggestedActions, setSummary, setSummaryCollapsed, setSummaryType]);

  useEffect(() => {
    // Only fetch if we have a threadId and haven't already fetched for this thread
    if (!email?.threadId || fetchedThreadIdRef.current === email.threadId) {
      return;
    }
    
    // Mark as fetched immediately to prevent duplicate calls
    fetchedThreadIdRef.current = email.threadId;
    
    fetchNote();
    fetchThreadEmails();
    const fetchAndAutoExtract = async () => {
      try {
        // Fetch action items for the thread (not just this email)
        const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
        setActionItems(response.data);
        
        // Store response for later use in the threadEmails effect
        if (response.data.length === 0 && email.body) {
          // Will be handled in the threadEmails effect below
        }
      } catch (error) {
        console.error('Error fetching action items:', error);
      }
    };
    fetchAndAutoExtract();
  }, [email?.threadId, email?.id, email?.body, email?.from, email?.fromName, fetchNote, fetchThreadEmails, setActionItems]);

  useEffect(() => {
    if (threadEmails.length > 0) {
      const mostRecentId = threadEmails[0]?.id;
      if (mostRecentId && expandedItemsSetRef.current !== mostRecentId) {
        expandedItemsSetRef.current = mostRecentId;
        setExpandedThreadItems(new Set([mostRecentId]));
      }
      
      // Check if we should auto-extract action items
      // Only if: no action items exist AND this email is the latest in thread
      // AND we haven't already attempted extraction for this email
      const latestEmailInThread = threadEmails[0];
      const isLatestEmail = latestEmailInThread && latestEmailInThread.id === email?.id;
      
      if (isLatestEmail && email?.body && actionItems.length === 0 && autoExtractedRef.current !== email.id) {
        autoExtractedRef.current = email.id;
        const autoExtract = async () => {
          try {
            const extractResponse = await axios.post(`${API_URL}/llm/extract-actions`, {
              emailBody: email.body,
              senderInfo: {
                from: email.from,
                fromName: email.fromName,
              },
            });
            if (extractResponse.data && extractResponse.data.length > 0) {
              const newItems = extractResponse.data.map((item: any) => ({
                description: item.description,
                isCompleted: false,
                source: 'llm',
              }));
              await Promise.all(newItems.map((item: any) => 
                axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
              ));
              const updatedResponse = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
              setActionItems(updatedResponse.data);
            }
          } catch (extractError) {
            console.error('Error auto-extracting actions:', extractError);
          }
        };
        autoExtract();
      }
    }
  }, [threadEmails, setExpandedThreadItems, email, actionItems, setActionItems]);
};



