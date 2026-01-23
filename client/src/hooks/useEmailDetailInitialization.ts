import { useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  
  // Clear summary and reset state when email ID changes to prevent showing old data
  useEffect(() => {
    if (id && id !== previousEmailIdRef.current) {
      // Email ID changed, clear all stale data
      setSummary(null);
      setSummaryType('tldr'); // Reset to default type
      setThreadEmails([]); // Clear thread emails to prevent showing stale content
      setExpandedThreadItems(new Set()); // Clear expanded state
      setActionItems([]); // Clear action items
      // Reset initialization and fetch tracking for the new email
      initializedEmailIdRef.current = null;
      fetchedEmailIdRef.current = null;
      fetchedThreadIdRef.current = null;
      previousEmailIdRef.current = id;
    }
  }, [id, setSummary, setSummaryType, setThreadEmails, setExpandedThreadItems, setActionItems]);
  
  // Track manual summaryType changes
  useEffect(() => {
    if (id && summaryType !== 'tldr' && initializedEmailIdRef.current !== id) {
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
          summaryType === 'tldr';
        
        if (shouldAutoSelect) {
          const rulesList = rules || [];
          
          if (rulesList.length > 0) {
            try {
              // Try to match a rule automatically based on whenToUse criteria
              const response = await axios.post(`${API_URL}/summarize/match-rule/${id}`);
              const matchedRule = response.data?.rule;
              
              if (matchedRule && matchedRule.ruleId && matchedRule.whenToUse && matchedRule.howToSummarize) {
                // Use the matched rule
                initializedEmailIdRef.current = id;
                handleUseCustomRule(matchedRule);
              } else {
                // Fallback to first rule if matching failed or returned invalid data
                console.warn('Rule matching returned invalid data, using first rule');
                const firstRule = rulesList[0];
                if (firstRule && firstRule.ruleId && firstRule.whenToUse && firstRule.howToSummarize) {
                  initializedEmailIdRef.current = id;
                  handleUseCustomRule(firstRule);
                } else {
                  // Last resort: use default TL;DR
                  console.error('Invalid rule data, falling back to TL;DR');
                  initializedEmailIdRef.current = id;
                  handleSummarize('tldr');
                }
              }
            } catch (error) {
              console.error('Error matching rule, using first rule:', error);
              // Fallback to first rule on error
              const firstRule = rulesList[0];
              if (firstRule && firstRule.ruleId && firstRule.whenToUse && firstRule.howToSummarize) {
                initializedEmailIdRef.current = id;
                handleUseCustomRule(firstRule);
            } else {
                // Last resort: use default TL;DR
                console.error('Invalid rule data, falling back to TL;DR');
                initializedEmailIdRef.current = id;
              handleSummarize('tldr');
              }
            }
          } else {
            // No custom rules, use default TL;DR
            initializedEmailIdRef.current = id;
            handleSummarize('tldr');
          }
        } else if (emailData && emailData.summary && !summary) {
          // Email already has a summary from the server, use it
          setSummary(emailData.summary);
          setSummaryType('tldr');
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
      if (mostRecentId) {
        setExpandedThreadItems(new Set([mostRecentId]));
      }
      
      // Check if we should auto-extract action items
      // Only if: no action items exist AND this email is the latest in thread
      const latestEmailInThread = threadEmails[0];
      const isLatestEmail = latestEmailInThread && latestEmailInThread.id === email?.id;
      
      if (isLatestEmail && email?.body && actionItems.length === 0) {
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



