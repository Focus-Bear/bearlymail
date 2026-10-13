import React, { useCallback, useEffect, useRef, useState } from 'react';

export const HOLD_TO_CONFIRM_DEFAULT_MS = 5000;
export const HOLD_PROGRESS_TICK_MS = 50;
const HOLD_KEYS = new Set([' ', 'Enter']);
const PROGRESS_COMPLETE = 1;

interface UseHoldToConfirmOptions {
  onConfirm: () => void;
  durationMs?: number;
  disabled?: boolean;
}

export interface HoldToConfirmHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onKeyUp: (event: React.KeyboardEvent) => void;
  onBlur: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

interface UseHoldToConfirmResult {
  /** 0 → 1 fraction of the hold completed; resets to 0 on release. */
  progress: number;
  isHolding: boolean;
  /** Spread onto the hold target (a native <button>). */
  holdHandlers: HoldToConfirmHandlers;
}

function isHoldKey(event: React.KeyboardEvent): boolean {
  return HOLD_KEYS.has(event.key);
}

/**
 * Press-and-hold confirmation: `onConfirm` fires once the target has been held
 * (pointer, or Space/Enter for keyboard users) for `durationMs`. Releasing,
 * leaving, or blurring early resets progress. Deliberate friction for actions
 * we want the user to pause on.
 */
export function useHoldToConfirm({
  onConfirm,
  durationMs = HOLD_TO_CONFIRM_DEFAULT_MS,
  disabled = false,
}: UseHoldToConfirmOptions): UseHoldToConfirmResult {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    const ratio = Math.min((Date.now() - startedAtRef.current) / durationMs, PROGRESS_COMPLETE);
    setProgress(ratio);
    if (ratio >= PROGRESS_COMPLETE) {
      stopHold();
      onConfirmRef.current();
    }
  }, [durationMs, stopHold]);

  const startHold = useCallback(() => {
    if (disabled || intervalRef.current) {
      return;
    }
    startedAtRef.current = Date.now();
    setIsHolding(true);
    intervalRef.current = setInterval(tick, HOLD_PROGRESS_TICK_MS);
  }, [disabled, tick]);

  useEffect(() => stopHold, [stopHold]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isHoldKey(event)) {
        return;
      }
      // Stop the native button click (Enter keydown / Space keyup) and ignore
      // auto-repeat so holding the key doesn't restart the timer.
      event.preventDefault();
      if (!event.repeat) {
        startHold();
      }
    },
    [startHold]
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      if (isHoldKey(event)) {
        event.preventDefault();
        stopHold();
      }
    },
    [stopHold]
  );

  const onContextMenu = useCallback((event: React.MouseEvent) => event.preventDefault(), []);

  return {
    progress,
    isHolding,
    holdHandlers: {
      onPointerDown: startHold,
      onPointerUp: stopHold,
      onPointerLeave: stopHold,
      onPointerCancel: stopHold,
      onKeyDown,
      onKeyUp,
      onBlur: stopHold,
      onContextMenu,
    },
  };
}
