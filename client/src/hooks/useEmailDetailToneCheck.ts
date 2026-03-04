import { useCallback,useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

interface ToneCheckResult {
  isOk: boolean;
  suggestions: string[];
  revisedText?: string;
}

interface DisputeResult {
  accepted: boolean;
  rulesToRemove: string[];
  explanation: string;
  rulesUpdated: boolean;
  remainingRules: string[];
}

export function useEmailDetailToneCheck() {
  const [checkingTone, setCheckingTone] = useState(false);
  const [toneCheckResult, setToneCheckResult] = useState<ToneCheckResult | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeResult, setDisputeResult] = useState<DisputeResult | null>(null);

  const checkTone = useCallback(async (draft: string): Promise<boolean> => {
    setCheckingTone(true);
    setDisputeResult(null);
    try {
      const currentTime = new Date().toISOString();
      const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, { text: draft, currentTime });
      setToneCheckResult(toneResponse.data);
      
      if (!toneResponse.data.isOk) {
        setCheckingTone(false);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking tone:', error);
      return false;
    } finally {
      setCheckingTone(false);
    }
  }, []);

  const disputeToneCheck = useCallback(async (
    emailText: string,
    suggestions: string[],
    userArgument: string,
  ): Promise<DisputeResult | null> => {
    setDisputing(true);
    try {
      const response = await axios.post(`${API_URL}/llm/dispute-tone-check`, {
        emailText,
        suggestions,
        userArgument,
      });
      setDisputeResult(response.data);
      if (response.data.accepted) {
        setToneCheckResult({ isOk: true, suggestions: [] });
      }
      return response.data;
    } catch (error) {
      console.error('Error disputing tone check:', error);
      return null;
    } finally {
      setDisputing(false);
    }
  }, []);

  const clearDisputeResult = useCallback(() => {
    setDisputeResult(null);
  }, []);

  return {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
    disputing,
    disputeResult,
    disputeToneCheck,
    clearDisputeResult,
  };
}





