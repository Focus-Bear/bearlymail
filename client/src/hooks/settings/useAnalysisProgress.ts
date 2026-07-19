import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { devDebug, devError, devLog } from 'utils/dev-logger';
import { getAxiosErrorMessage } from 'utils/errors';

import { API_URL } from 'config/api';
import {
  DELAY_1_SECOND_MS,
  HTTP_TOO_MANY_REQUESTS,
  MAX_POLL_RETRIES_429,
  MAX_RETRIES_POLLING,
  MS_PER_SECOND,
  POLLING_DELAY_MS,
  POLLING_INTERVAL_MS,
} from 'constants/numbers';
import { usePollingWithBackoff } from 'hooks/usePollingWithBackoff';

// Static stage-order mapping — defined at module level so it is stable across renders
const STAGE_ORDER: Record<string, number> = {
  'settings.analysis.progress.starting': 0,
  'settings.analysis.progress.fetching': 1,
  'settings.analysis.progress.analyzing': 2,
  'settings.analysis.progress.finalizing': 3,
  'settings.analysis.progress.complete': 4,
  'settings.analysis.progress.completeSimple': 4,
};

export interface AnalyzeProgress {
  show: boolean;
  progress: {
    current: number;
    total: number;
    messageKey?: string;
    messageValues?: Record<string, unknown>;
    threadCount?: number;
    analyzedCount?: number;
    batchStatus?: {
      completedBatches: number;
      totalBatches: number;
    };
    stats?: {
      totalThreads: number;
      outboundEmails: number;
      threadsNeverOpened: number;
      threadsReadButNotReplied: number;
      vipContactsEvaluated: number;
    };
    insights?: Array<{ type: string; message: string }>;
  } | null;
  error: string | null;
  isComplete: boolean;
}

const getStageOrder = (messageKey?: string | null): number => {
  if (!messageKey) {
    return -1;
  }
  return STAGE_ORDER[messageKey] ?? -1;
};

const resolveEffectiveMessageKey = ({
  messageKey,
  messageKeyHighWaterMark,
}: {
  messageKey?: string;
  messageKeyHighWaterMark: MutableRefObject<string | null>;
}): string | undefined => {
  const currentStageOrder = getStageOrder(messageKey);
  const highWaterMessageKey = messageKeyHighWaterMark.current;
  const highWaterStageOrder = getStageOrder(highWaterMessageKey);

  if (currentStageOrder > highWaterStageOrder) {
    messageKeyHighWaterMark.current = messageKey ?? null;
    devLog(`Message stage advanced: ${messageKey} (order ${currentStageOrder})`);
    return messageKey;
  }

  if (currentStageOrder < highWaterStageOrder && highWaterMessageKey) {
    devLog(
      `Message stage went backwards (${messageKey} order ${currentStageOrder} < ${highWaterMessageKey} order ${highWaterStageOrder}), using high water mark: ${highWaterMessageKey}`
    );
    return highWaterMessageKey;
  }

  return messageKey;
};

export interface UseAnalysisProgressOptions {
  isNewUserOnboarding?: boolean;
}

export const useAnalysisProgress = (onComplete?: () => Promise<void>, hookOptions?: UseAnalysisProgressOptions) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalyzeProgress>({
    show: false,
    progress: null,
    error: null,
    isComplete: false,
  });

  // Refs to track polling state across renders (needed because closures capture stale state)
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const progressHighWaterMark = useRef(0); // Track highest progress to prevent going backwards
  const messageKeyHighWaterMark = useRef<string | null>(null); // Track highest stage to prevent message going backwards
  // Backoff circuit breaker for 429 handling — uses a single synthetic key since there is
  // only one analysis-progress polling loop. Stored in refs so it never triggers re-renders.
  const backoff = usePollingWithBackoff({ maxRetries: MAX_POLL_RETRIES_429 });
  // Stable key for the single analysis-progress poll
  const ANALYSIS_BACKOFF_KEY = 'analysis-progress';

  // Stage order is now a stable module-level constant (STAGE_ORDER)

  // Bug 2 fix: On mount, check whether there is already a running/pending
  // analysis on the backend (e.g. user reloaded the page mid-analysis).
  // The backend GET /context/analyze-progress without an analysisId falls back
  // to the most recent running/pending analysis for the user.  If one is found,
  // resume polling from that analysisId rather than starting from scratch.
  useEffect(() => {
    let cancelled = false;

    const resumeIfInProgress = async () => {
      try {
        const response = await axios.get(`${API_URL}/context/analyze-progress`);
        if (cancelled) {
          return;
        }

        const resumeCheckResult = response.data;
        // Backend returns an analysisId when an in-progress analysis exists
        if (
          resumeCheckResult?.analysisId &&
          resumeCheckResult?.progress &&
          !resumeCheckResult?.progress?.isComplete &&
          !resumeCheckResult?.error
        ) {
          devLog(`[useAnalysisProgress] Resuming in-progress analysis on mount: ${resumeCheckResult.analysisId}`);
          setAnalysisId(resumeCheckResult.analysisId);
          setAnalyzing(true);
          setAnalyzeProgress({
            show: true,
            progress: resumeCheckResult.progress,
            error: null,
            isComplete: false,
          });
        }
      } catch (err) {
        // Non-critical: if the check fails, do nothing — the user can start manually
        devDebug('[useAnalysisProgress] Mount resume check failed (non-fatal):', err);
      }
    };

    resumeIfInProgress();

    return () => {
      cancelled = true;
    };
    // Run once on mount only
  }, []);

  const startAnalysis = useCallback(async () => {
    devLog('===== Starting Context Analysis =====');
    devDebug('Setting analyzing state to true');

    // Reset cancellation flag, high water marks, and backoff state when starting new analysis
    cancelledRef.current = false;
    progressHighWaterMark.current = 0;
    messageKeyHighWaterMark.current = null;
    backoff.onSuccess(ANALYSIS_BACKOFF_KEY); // clear any prior exhausted/backoff state

    setAnalyzing(true);
    setAnalyzeProgress({
      show: true,
      progress: { current: 0, total: 100, messageKey: 'settings.analysis.progress.starting' },
      error: null,
      isComplete: false,
    });

    try {
      devLog(`Making POST request to ${API_URL}/context/analyze`);
      const response = await axios.post(`${API_URL}/context/analyze`, {
        isNewUserOnboarding: hookOptions?.isNewUserOnboarding ?? false,
      });
      devLog('POST request successful', response.data);

      // Store analysis ID from response
      if (response.data.analysisId) {
        setAnalysisId(response.data.analysisId);
        devLog(`Stored analysis ID: ${response.data.analysisId}`);
      }
    } catch (error: unknown) {
      devError('Error starting context analysis:', error);
      console.error('[FRONTEND ERROR] Error starting context analysis:', error);
      if (axios.isAxiosError(error)) {
        devError('Error response:', error.response?.data);
        console.error('[FRONTEND ERROR] Error response:', error.response?.data);
        devError('Error status:', error.response?.status);
        console.error('[FRONTEND ERROR] Error status:', error.response?.status);
      }
      console.error('Error starting context analysis:', error);
      setAnalyzing(false);
      setAnalysisId(null); // Clear analysis ID on error
      setAnalyzeProgress({
        show: true,
        progress: null,
        error: getAxiosErrorMessage(error, 'Failed to start analysis. Please try again.'),
        isComplete: false,
      });
      // Auto-clear removed: errors should persist so users can see and retry (fixes P0 infinite loop)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing
  }, []);

  useEffect(() => {
    // Don't start polling until BOTH analyzing is true AND analysisId is set
    // This prevents the first poll from using an old/null analysisId
    if (!analyzing) {
      return;
    }
    if (!analysisId) {
      devDebug('Waiting for analysisId before starting to poll...');
      return; // Wait for analysisId to be set - effect will re-run when it changes
    }

    let retryCount = 0;
    let errorCount = 0;

    const handleErrorResponse = (errorMessage: string, timeoutId: ReturnType<typeof setTimeout> | null) => {
      devError('Handling error response:', errorMessage);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setAnalyzing(false);
      setAnalyzeProgress({
        show: true,
        progress: null,
        error: errorMessage,
        isComplete: false,
      });
      // Auto-clear removed: errors should persist so users can see and retry (fixes P0 infinite loop)
    };

    const handleProgressResponse = async (
      progressData: NonNullable<AnalyzeProgress['progress']>,
      timeoutId: ReturnType<typeof setTimeout> | null
    ) => {
      // CRITICAL: Check if cancelled before updating state
      if (cancelledRef.current) {
        devDebug('handleProgressResponse skipped - cancelled');
        return;
      }

      const { current, total, messageKey, messageValues, threadCount, analyzedCount, batchStatus, stats, insights } =
        progressData;

      // CRITICAL: Use high water mark to prevent progress from going backwards
      // This handles race conditions where polling catches intermediate database states
      const effectiveCurrent = Math.max(current, progressHighWaterMark.current);
      if (current > progressHighWaterMark.current) {
        progressHighWaterMark.current = current;
        devLog(`High water mark updated: ${progressHighWaterMark.current}%`);
      } else if (current < progressHighWaterMark.current) {
        devLog(
          `Progress went backwards (${current}% < ${progressHighWaterMark.current}%), using high water mark: ${effectiveCurrent}%`
        );
      }

      const isComplete = total > 0 && effectiveCurrent >= total;
      errorCount = 0;
      retryCount = 0;
      backoff.onSuccess(ANALYSIS_BACKOFF_KEY);

      // CRITICAL: Use stage-based high water mark for messageKey to prevent message going backwards
      // (e.g., showing "fetching" after "analyzing" due to backend race conditions)
      const effectiveMessageKey = resolveEffectiveMessageKey({
        messageKey,
        messageKeyHighWaterMark,
      });

      setAnalyzeProgress({
        show: true,
        progress: {
          current: effectiveCurrent,
          total,
          messageKey: effectiveMessageKey,
          messageValues,
          threadCount,
          analyzedCount,
          batchStatus,
          stats: stats || undefined,
          insights: insights || undefined,
        },
        error: null,
        isComplete,
      });

      if (isComplete) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        setAnalyzing(false);
        setAnalysisId(null); // Clear analysis ID when complete
        await new Promise(resolve => setTimeout(resolve, DELAY_1_SECOND_MS));
        if (onComplete) {
          await onComplete();
        }
      }
    };

    const handleNoProgressResponse = async (timeoutId: ReturnType<typeof setTimeout> | null) => {
      retryCount++;
      devDebug(`No progress response - retry count: ${retryCount}`);
      if (retryCount < MAX_RETRIES_POLLING) {
        return;
      }
      devLog(`No progress after ${MAX_RETRIES_POLLING} retries - stopping analysis`);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setAnalyzing(false);
      setAnalysisId(null);
      setAnalyzeProgress({
        show: true,
        progress: null,
        error: 'Analysis timed out. You can re-run it from Settings.',
        isComplete: false,
      });
    };

    // Use setTimeout-based polling that waits 2s AFTER receiving response, not fixed interval
    let isPolling = false;

    // eslint-disable-next-line max-statements -- pre-existing
    const pollProgress = async () => {
      // CRITICAL: Don't poll until we have an analysisId - prevents fetching old completed analyses
      if (!analysisId) {
        devDebug('Poll skipped - waiting for analysisId to be set');
        // Retry in 500ms
        pollingTimeoutRef.current = setTimeout(() => {
          if (!cancelledRef.current) {
            pollProgress();
          }
        }, POLLING_DELAY_MS);
        return;
      }

      if (isPolling) {
        return; // Skip if previous request is still in progress
      }

      isPolling = true;

      try {
        // Pass analysis ID in polling request - now always has value due to check above
        const url = `${API_URL}/context/analyze-progress?analysisId=${analysisId}`;
        devDebug(`Polling progress from ${url}`);

        const response = await axios.get(url);

        devDebug('Progress response:', response.data);

        if (response.data.error) {
          devError('Progress check returned error:', response.data.error);
          handleErrorResponse(
            response.data.error.message || 'Analysis failed. Please try again.',
            pollingTimeoutRef.current
          );
          isPolling = false;
          return;
        }

        if (response.data.progress) {
          const rawPercent = response.data.progress.current;
          devLog(
            `[RAW] Progress update from backend: ${rawPercent}/${response.data.progress.total} - ${response.data.progress.messageKey || 'No messageKey'}, high water mark: ${progressHighWaterMark.current}`
          );
          await handleProgressResponse(response.data.progress, pollingTimeoutRef.current);
        } else {
          devDebug('No progress in response, calling handleNoProgressResponse');
          await handleNoProgressResponse(pollingTimeoutRef.current);
        }

        // Wait 2 seconds AFTER receiving response before next poll
        // CRITICAL: Check cancelledRef (not analyzing state) to ensure cancellation is seen
        if (!cancelledRef.current) {
          pollingTimeoutRef.current = setTimeout(() => {
            if (!cancelledRef.current) {
              pollProgress();
            }
          }, POLLING_INTERVAL_MS);
        }
      } catch (error: unknown) {
        devError('Error fetching analysis progress:', error);
        console.error('Error fetching analysis progress:', error);

        const backoffState = backoff.onError(ANALYSIS_BACKOFF_KEY, error);
        const is429 = axios.isAxiosError(error) && error.response?.status === HTTP_TOO_MANY_REQUESTS;

        if (backoffState.exhausted) {
          // Max retries reached — surface a permanent error to the user.
          setAnalyzing(false);
          setAnalysisId(null);
          const errorMessage = is429
            ? 'Too many requests. Please wait a moment and try again.'
            : getAxiosErrorMessage(error, 'Failed to fetch analysis progress. Please try again.');
          setAnalyzeProgress({
            show: true,
            progress: null,
            error: errorMessage,
            isComplete: false,
          });
          isPolling = false;
          return; // Stop polling — exhausted
        }

        const delayMs = Math.max(0, backoffState.nextAllowedAt - Date.now());
        console.warn(
          `[useAnalysisProgress] ${is429 ? '429 rate-limited' : 'Fetch error'}, retry ${backoffState.retryCount}/${MAX_POLL_RETRIES_429} in ${Math.round(delayMs / MS_PER_SECOND)}s`
        );

        // Fall back to error-count gating for non-429 errors
        if (!is429) {
          errorCount++;
          if (errorCount >= 3) {
            setAnalyzing(false);
            setAnalysisId(null);
            const errorMessage = getAxiosErrorMessage(error, 'Failed to fetch analysis progress. Please try again.');
            setAnalyzeProgress({
              show: true,
              progress: null,
              error: errorMessage,
              isComplete: false,
            });
            isPolling = false;
            return;
          }
        }

        if (!cancelledRef.current) {
          pollingTimeoutRef.current = setTimeout(() => {
            if (!cancelledRef.current) {
              pollProgress();
            }
          }, delayMs);
        }
      } finally {
        isPolling = false;
      }
    };

    // Start polling immediately
    pollProgress();

    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      backoff.cancelAll();
    };
    // `backoff` is intentionally excluded from the dependency array.
    // It is now a stable memoised object (useMemo in usePollingWithBackoff), but
    // including it here would risk re-triggering this effect if the memo identity
    // ever changes. The polling loop captures all needed backoff methods through
    // the closure established at effect setup time; those callbacks are themselves
    // stable (useCallback) so this is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, analysisId, onComplete]);

  const dismissProgress = useCallback(() => {
    // Stop polling when user dismisses - use ref to ensure closure sees the cancellation
    cancelledRef.current = true;

    // Clear any pending timeout
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }

    setAnalyzing(false);
    setAnalysisId(null);
    setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false });

    devLog('Analysis dismissed - polling cancelled');
  }, []);

  return {
    analyzing,
    analyzeProgress,
    setAnalyzing,
    setAnalyzeProgress,
    startAnalysis,
    dismissProgress,
  };
};
