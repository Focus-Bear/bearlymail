import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

export function useEmailDetailToneCheck() {
  const [checkingTone, setCheckingTone] = useState(false);
  const [toneCheckResult, setToneCheckResult] = useState<{ isOk: boolean; suggestions: string[]; revisedText?: string } | null>(null);

  const checkTone = useCallback(async (draft: string): Promise<boolean> => {
    setCheckingTone(true);
    try {
      const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, { text: draft });
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

  return {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
  };
}





