import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

interface Email {
  id: string;
  emailThreadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
}

interface UseReplyDraftGenerationOptions {
  autoGenerate?: boolean;
}

interface SuggestedReplyResponse {
  options: Array<{ label: string; text: string }>;
  isGenerating: boolean;
  lastEmailId: string | null;
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
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(false);
  const lastGeneratedEmailId = useRef<string | null>(null);
  const currentGenerationEmailIdRef = useRef<string | null>(null);
  const previousEmailIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousEmailIdRef.current !== null && previousEmailIdRef.current !== emailId) {
      setReplyOptions(null);
      setDraft(null);
      setSelectedReplyOption(0);
      setLoadingReplies(false);
      setIsGeneratingInBackground(false);
    }
    previousEmailIdRef.current = emailId;
  }, [emailId]);

  const fetchPreGeneratedReplies = useCallback(async (threadId: string): Promise<SuggestedReplyResponse | null> => {
    try {
      const response = await axios.get(`${API_URL}/suggested-replies/${threadId}`);
      return response.data;
    } catch {
      return null;
    }
  }, []);

  const generateRepliesOnDemand = useCallback(async (currentEmail: Email): Promise<Array<{ label: string; text: string }> | null> => {
    try {
      const response = await axios.post(`${API_URL}/llm/suggest-replies`, {
        originalEmail: {
          from: currentEmail.from,
          fromName: currentEmail.fromName,
          subject: currentEmail.subject,
          body: currentEmail.body,
        }
      });
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const handleGenerateDraft = useCallback(async () => {
    if (!emailId || !email) return;
    
    const currentEmailId = emailId;
    currentGenerationEmailIdRef.current = currentEmailId;
    
    setLoadingReplies(true);
    
    try {
      let generatedOptions: Array<{ label: string; text: string }> | null = null;
      
      if (email.emailThreadId) {
        const preGenerated = await fetchPreGeneratedReplies(email.emailThreadId);
        
        if (currentGenerationEmailIdRef.current !== currentEmailId) {
          return;
        }
        
        if (preGenerated) {
          if (preGenerated.isGenerating) {
            setIsGeneratingInBackground(true);
          }
          
          if (preGenerated.options && preGenerated.options.length > 0) {
            generatedOptions = preGenerated.options;
          }
        }
      }
      
      if (!generatedOptions) {
        if (currentGenerationEmailIdRef.current !== currentEmailId) {
          return;
        }
        generatedOptions = await generateRepliesOnDemand(email);
      }
      
      if (currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      
      if (generatedOptions && generatedOptions.length > 0) {
        const optionsWithCustom = [
          ...generatedOptions,
          { label: 'Custom', text: '' }
        ];
        setReplyOptions(optionsWithCustom);
        setDraft(generatedOptions[0].text);
        setSelectedReplyOption(0);
      } else {
        setReplyOptions([{ label: 'Custom', text: '' }]);
        setDraft('');
        setSelectedReplyOption(0);
      }
      lastGeneratedEmailId.current = emailId;
    } catch (error) {
      if (currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      console.error('Error generating draft:', error);
      setReplyOptions([{ label: 'Custom', text: '' }]);
      setDraft('');
      setSelectedReplyOption(0);
    } finally {
      if (currentGenerationEmailIdRef.current === currentEmailId) {
        setLoadingReplies(false);
        setIsGeneratingInBackground(false);
      }
    }
  }, [emailId, email, fetchPreGeneratedReplies, generateRepliesOnDemand]);

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
    isGeneratingInBackground,
    setReplyOptions,
    setDraft,
    setSelectedReplyOption,
    handleGenerateDraft,
  };
}





