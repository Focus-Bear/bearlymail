import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

interface Email {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
}

interface UseReplyDraftGenerationOptions {
  autoGenerate?: boolean;
}

export function useReplyDraftGeneration(
  emailId: string,
  email: Email | null,
  options: UseReplyDraftGenerationOptions = {},
) {
  const { autoGenerate = false } = options;
  const [replyOptions, setReplyOptions] = useState<Array<{ label: string; text: string }> | null>(null);
  const [selectedReplyOption, setSelectedReplyOption] = useState<number>(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const lastGeneratedEmailId = useRef<string | null>(null);
  // Track current email ID for draft generation to prevent race conditions
  const currentGenerationEmailIdRef = useRef<string | null>(null);
  // Track previous email ID to reset state when switching emails
  const previousEmailIdRef = useRef<string | null>(null);

  // Reset state when email ID changes to prevent showing stale data
  useEffect(() => {
    if (previousEmailIdRef.current !== null && previousEmailIdRef.current !== emailId) {
      // Email changed - reset reply state immediately
      setReplyOptions(null);
      setDraft(null);
      setSelectedReplyOption(0);
      setLoadingReplies(false);
    }
    previousEmailIdRef.current = emailId;
  }, [emailId]);

  const handleGenerateDraft = useCallback(async () => {
    if (!emailId || !email) return;
    
    // Track which email we're generating for to prevent race conditions
    const currentEmailId = emailId;
    currentGenerationEmailIdRef.current = currentEmailId;
    
    setLoadingReplies(true);
    try {
      const response = await axios.post(`${API_URL}/llm/suggest-replies`, {
        originalEmail: {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        }
      });
      
      // Only update state if we're still looking at the same email
      // This prevents showing suggestions from a previous email after switching
      if (currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const optionsWithCustom = [
          ...response.data,
          { label: 'Custom', text: '' }
        ];
        setReplyOptions(optionsWithCustom);
        setDraft(response.data[0].text);
        setSelectedReplyOption(0);
      } else {
        setReplyOptions([{ label: 'Custom', text: '' }]);
        setDraft('');
        setSelectedReplyOption(0);
      }
      lastGeneratedEmailId.current = emailId;
    } catch (error) {
      // Only update state if we're still looking at the same email
      if (currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      console.error('Error generating draft:', error);
      setReplyOptions([{ label: 'Custom', text: '' }]);
      setDraft('');
      setSelectedReplyOption(0);
    } finally {
      // Only update loading state if we're still looking at the same email
      if (currentGenerationEmailIdRef.current === currentEmailId) {
        setLoadingReplies(false);
      }
    }
  }, [emailId, email]);

  useEffect(() => {
    if (autoGenerate && emailId && email && lastGeneratedEmailId.current !== emailId) {
      handleGenerateDraft();
    }
  }, [autoGenerate, emailId, email, handleGenerateDraft]);

  return {
    replyOptions,
    selectedReplyOption,
    draft,
    loadingReplies,
    setReplyOptions,
    setDraft,
    setSelectedReplyOption,
    handleGenerateDraft,
  };
}





