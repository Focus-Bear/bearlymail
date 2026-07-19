import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  BUMP_HIGHLIGHT_MS,
  type DemoTab,
  FLY_ANIMATION_MS,
  INITIAL_COUNTS,
  PRIO_ROUTES,
  type PrioChoice,
  TAB_TRIAGE,
  TOAST_VISIBLE_MS,
} from './constants';
import { useDemoResetTimer } from './useDemoResetTimer';

export interface DemoAnimationState {
  counts: typeof INITIAL_COUNTS;
  /** Tab currently holding the demo email, or null once it has been archived. */
  ownerTab: DemoTab | null;
  activeTab: DemoTab;
  selectedPrio: PrioChoice | null;
  pulseOn: boolean;
  flying: boolean;
  bumpedTab: DemoTab | null;
  toastKey: string | null;
  /** True once the visitor has clicked anything inside the demo. */
  hasInteracted: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  triageTabRef: React.RefObject<HTMLButtonElement | null>;
  actionTabRef: React.RefObject<HTMLButtonElement | null>;
  followupTabRef: React.RefObject<HTMLButtonElement | null>;
  handleTabClick: (name: DemoTab) => void;
  handlePrioClick: (prio: PrioChoice) => void;
  handleArchiveClick: () => void;
  handleRestartClick: () => void;
  handleDemoMouseEnter: () => void;
  handleDemoMouseLeave: () => void;
}

/** Sets the CSS offsets that make the card "fly" into the destination tab. */
function aimCardAtTab(cardEl: HTMLDivElement, tabEl: HTMLButtonElement): void {
  const tabRect = tabEl.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect();
  const tx = tabRect.left + tabRect.width / 2 - (cardRect.left + cardRect.width / 2);
  const ty = tabRect.top + tabRect.height / 2 - (cardRect.top + cardRect.height / 4);
  cardEl.style.setProperty('--tx', `${tx}px`);
  cardEl.style.setProperty('--ty', `${ty}px`);
}

/**
 * Encapsulates the animation, timer, and tab-routing state for the LiveDemo
 * component. Returns the state, refs, and handlers that the view layer needs
 * to render the demo.
 */
// eslint-disable-next-line max-lines-per-function
export function useDemoAnimation(): DemoAnimationState {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const triageTabRef = useRef<HTMLButtonElement | null>(null);
  const actionTabRef = useRef<HTMLButtonElement | null>(null);
  const followupTabRef = useRef<HTMLButtonElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [counts, setCounts] = useState(INITIAL_COUNTS);
  const [ownerTab, setOwnerTab] = useState<DemoTab | null>(TAB_TRIAGE);
  const [activeTab, setActiveTab] = useState<DemoTab>(TAB_TRIAGE);
  const [busy, setBusy] = useState(false);
  const [selectedPrio, setSelectedPrio] = useState<PrioChoice | null>(null);
  const [pulseOn, setPulseOn] = useState(true);
  const [flying, setFlying] = useState(false);
  const [bumpedTab, setBumpedTab] = useState<DemoTab | null>(null);
  const [toastKey, setToastKey] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const tabRefs: Record<DemoTab, React.RefObject<HTMLButtonElement | null>> = {
    triage: triageTabRef,
    action: actionTabRef,
    followup: followupTabRef,
  };

  const clearPendingTimers = useCallback(() => {
    for (const timerRef of [toastTimerRef, flyTimerRef, bumpTimerRef]) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const reset = useCallback(() => {
    // Cancel in-flight animation timers so a mid-animation restart cannot let
    // a stale callback fire afterwards and corrupt the freshly reset state
    // (e.g. counts rewritten or the card jumping into the destination tab).
    clearPendingTimers();
    setCounts(INITIAL_COUNTS);
    setOwnerTab(TAB_TRIAGE);
    setActiveTab(TAB_TRIAGE);
    setBusy(false);
    setSelectedPrio(null);
    setPulseOn(true);
    setFlying(false);
    setBumpedTab(null);
    setToastKey(null);
    setHasInteracted(false);
    if (cardRef.current) {
      cardRef.current.style.removeProperty('--tx');
      cardRef.current.style.removeProperty('--ty');
    }
  }, [clearPendingTimers]);

  const { scheduleReset, rescheduleIfPending, pauseReset, resumeReset, cancelReset } =
    useDemoResetTimer(reset);

  useEffect(() => () => clearPendingTimers(), [clearPendingTimers]);

  const showToast = (key: string) => {
    setToastKey(key);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToastKey(null), TOAST_VISIBLE_MS);
  };

  const handleTabClick = (name: DemoTab) => {
    setActiveTab(name);
    setHasInteracted(true);
    rescheduleIfPending();
  };

  const handleArchiveClick = () => {
    if (busy || flying || ownerTab === null) {
      return;
    }
    const owner = ownerTab;
    setCounts(prev => ({ ...prev, [owner]: Math.max(0, prev[owner] - 1) }));
    setOwnerTab(null);
    setPulseOn(false);
    setHasInteracted(true);
    showToast('routed.archiveDone');
    scheduleReset();
  };

  const handlePrioClick = (prio: PrioChoice) => {
    if (busy || ownerTab !== TAB_TRIAGE) {
      return;
    }
    const cfg = PRIO_ROUTES[prio];
    const cardEl = cardRef.current;
    const tabEl = tabRefs[cfg.dest].current;
    if (!cardEl || !tabEl) {
      return;
    }

    setBusy(true);
    setPulseOn(false);
    setSelectedPrio(prio);
    setHasInteracted(true);
    aimCardAtTab(cardEl, tabEl);
    setFlying(true);

    if (flyTimerRef.current) {
      clearTimeout(flyTimerRef.current);
    }
    flyTimerRef.current = setTimeout(() => {
      setCounts(prev => ({ ...prev, [TAB_TRIAGE]: 0, [cfg.dest]: prev[cfg.dest] + 1 }));
      setBumpedTab(cfg.dest);
      setOwnerTab(cfg.dest);
      setFlying(false);
      cardEl.style.removeProperty('--tx');
      cardEl.style.removeProperty('--ty');
      showToast(cfg.toastKeySuffix);
      setBusy(false);
      if (bumpTimerRef.current) {
        clearTimeout(bumpTimerRef.current);
      }
      bumpTimerRef.current = setTimeout(() => setBumpedTab(null), BUMP_HIGHLIGHT_MS);
      scheduleReset();
    }, FLY_ANIMATION_MS);
  };

  const handleRestartClick = () => {
    cancelReset();
    reset();
  };

  return {
    counts,
    ownerTab,
    activeTab,
    selectedPrio,
    pulseOn,
    flying,
    bumpedTab,
    toastKey,
    hasInteracted,
    cardRef,
    triageTabRef,
    actionTabRef,
    followupTabRef,
    handleTabClick,
    handlePrioClick,
    handleArchiveClick,
    handleRestartClick,
    handleDemoMouseEnter: pauseReset,
    handleDemoMouseLeave: resumeReset,
  };
}
