import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getCurrentTimeInTimezone } from 'utils/timezoneUtils';

import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';

interface ToneCheckResult {
  isOk: boolean;
  suggestions: string[];
  revisedText?: string;
  attachmentReminder?: string | null;
  inappropriateTiming?: string | null;
}

interface DisputeResult {
  accepted: boolean;
  rulesToRemove: string[];
  explanation: string;
  rulesUpdated: boolean;
  remainingRules: string[];
}

export function useEmailDetailToneCheck() {
  const { t } = useTranslation();
  const { showLoading } = useNotifications();
  const [checkingTone, setCheckingTone] = useState(false);
  const [toneCheckResult, setToneCheckResult] = useState<ToneCheckResult | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeResult, setDisputeResult] = useState<DisputeResult | null>(null);
  const timezoneRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dismissLoadingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    axios
      .get(`${API_URL}/batch-schedule`)
      .then(res => {
        timezoneRef.current = res.data?.timezone ?? undefined;
      })
      .catch(() => {
        // timezone remains undefined — getCurrentTimeInTimezone will fall back to UTC
      });
  }, []);

  const cancelToneCheck = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dismissLoadingRef.current?.();
    dismissLoadingRef.current = null;
    setCheckingTone(false);
  }, []);

  const checkTone = useCallback(async (draft: string, scheduledSendAt?: string | null): Promise<boolean> => {
    // Cancel any in-flight tone check before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setCheckingTone(true);
    setDisputeResult(null);
    // Use the same notification system as "Email sent" — it's already proven to appear.
    const dismiss = showLoading(t('toneCheck.toastChecking'));
    dismissLoadingRef.current = dismiss;

    if (controller.signal.aborted) {
      dismiss();
      if (dismissLoadingRef.current === dismiss) {
        dismissLoadingRef.current = null;
      }
      return false;
    }
    try {
      const currentTime = getCurrentTimeInTimezone(timezoneRef.current);
      const toneResponse = await axios.post(
        `${API_URL}/llm/check-tone`,
        {
          text: draft,
          currentTime,
          scheduledSendAt: scheduledSendAt ?? null,
        },
        { signal: controller.signal }
      );

      setToneCheckResult(toneResponse.data);

      if (!toneResponse.data.isOk) {
        setCheckingTone(false);
        return false;
      }
      return true;
    } catch (error) {
      if (axios.isCancel(error)) {
        // User cancelled — not an error
        return false;
      }
      console.error('Error checking tone:', error);
      return false;
    } finally {
      dismiss();
      if (dismissLoadingRef.current === dismiss) {
        dismissLoadingRef.current = null;
      }
      setCheckingTone(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [showLoading, t]);

  const disputeToneCheck = useCallback(
    async (emailText: string, suggestions: string[], userArgument: string): Promise<DisputeResult | null> => {
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
    },
    []
  );

  const clearDisputeResult = useCallback(() => {
    setDisputeResult(null);
  }, []);

  return {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
    cancelToneCheck,
    disputing,
    disputeResult,
    disputeToneCheck,
    clearDisputeResult,
  };
}
