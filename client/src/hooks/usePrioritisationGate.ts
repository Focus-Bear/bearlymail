import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export const GATE_THRESHOLD = 20;
const POLL_INTERVAL_MS = 5000;
const GATE_DISMISSED_KEY = 'inbox_gate_graduated';
const GATE_FILTER_SWITCHED_KEY = 'inbox_gate_filter_switched';

interface PrioritisationStatus {
  totalThreads: number;
  prioritisedCount: number;
  unprioritisedCount: number;
  isAnalysisRunning: boolean;
}

interface UsePrioritisationGateResult {
  isGated: boolean;
  prioritisedCount: number;
  /** Actual total thread count from the server (not inflated to 20) */
  totalCount: number;
  isLoading: boolean;
  /** True if the gate just transitioned from gated → ungated this session */
  justUngated: boolean;
  clearJustUngated: () => void;
  /** Dismiss the gate manually (skip link). Prevents re-gating this session. */
  dismissGate: () => void;
}

/**
 * Controls the inbox gate interstitial shown while fewer than 20 emails are prioritised.
 *
 * Gate rules:
 * - Gate is active when: prioritisedCount < 20 AND isAnalysisRunning (unprioritised > 0)
 * - Gate is bypassed when: user has previously seen inbox (sessionStorage flag)
 * - Polls every 5s while gated, stops once gate lifts
 * - On ungate: sets `justUngated = true` so parent can auto-switch to VH filter once
 *
 * Note: `isAnalysisRunning` is a heuristic — it equals (unprioritisedCount > 0).
 * If analysis stalls, the sessionStorage dismiss key provides an escape hatch.
 */
export function usePrioritisationGate(): UsePrioritisationGateResult {
  const [status, setStatus] = useState<PrioritisationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justUngated, setJustUngated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGatedRef = useRef<boolean | null>(null);

  // Store fetchStatus in a ref to break the circular dependency between
  // fetchStatus → scheduleNextPoll → fetchStatus useCallbacks.
  const fetchStatusRef = useRef<(() => Promise<boolean>) | null>(null);

  const hasDismissed = (): boolean => {
    try {
      return !!sessionStorage.getItem(GATE_DISMISSED_KEY);
    } catch {
      return false;
    }
  };

  const markDismissed = (): void => {
    try {
      sessionStorage.setItem(GATE_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const computeIsGated = useCallback((prioritisationStatus: PrioritisationStatus | null): boolean => {
    if (!prioritisationStatus) {
      return false;
    }
    if (hasDismissed()) {
      return false;
    }
    // Only gate while analysis is still running AND fewer than threshold are done
    return prioritisationStatus.isAnalysisRunning && prioritisationStatus.prioritisedCount < GATE_THRESHOLD;
  }, []);

  const fetchStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await axios.get<PrioritisationStatus>(`${API_URL}/emails/prioritisation-status`);
      const newStatus = response.data;
      setStatus(newStatus);

      const nowGated = computeIsGated(newStatus);

      // Detect gate lifting (gated → not gated)
      if (prevGatedRef.current === true && !nowGated) {
        markDismissed();
        setJustUngated(true);
      }
      prevGatedRef.current = nowGated;

      return nowGated;
    } catch (error) {
      console.error('[usePrioritisationGate] Failed to fetch prioritisation status:', error);
      // On error, do not gate — fail open
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [computeIsGated]);

  // Keep the ref in sync with the latest fetchStatus closure
  fetchStatusRef.current = fetchStatus;

  // scheduleNextPoll uses fetchStatusRef to avoid a circular dependency on fetchStatus.
  // This means scheduleNextPoll has a stable identity and won't cause the useEffect to
  // re-run every render.
  const scheduleNextPoll = useCallback((stillGated: boolean) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    if (stillGated) {
      pollTimerRef.current = setTimeout(async () => {
        const gated = await fetchStatusRef.current?.();
        scheduleNextPoll(gated ?? false);
      }, POLL_INTERVAL_MS);
    }
  }, []); // stable — no deps via ref pattern

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const gated = await fetchStatus();
      if (!cancelled) {
        scheduleNextPoll(gated);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchStatus, scheduleNextPoll]);

  const clearJustUngated = useCallback(() => {
    setJustUngated(false);
    try {
      localStorage.setItem(GATE_FILTER_SWITCHED_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  /** Called when user explicitly skips the gate (dismiss button). Prevents re-gating this session. */
  const dismissGate = useCallback(() => {
    markDismissed();
    setDismissed(true); // triggers immediate re-render so isGated becomes false
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const isGated = !dismissed && computeIsGated(status);
  const prioritisedCount = status?.prioritisedCount ?? 0;
  // Use actual totalThreads for display (not inflated to 20).
  // The GATE_THRESHOLD of 20 is only used for the gate condition check above.
  const totalCount = status?.totalThreads ?? 0;

  return { isGated, prioritisedCount, totalCount, isLoading, justUngated, clearJustUngated, dismissGate };
}

export { GATE_FILTER_SWITCHED_KEY };
