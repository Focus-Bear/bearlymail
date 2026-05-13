import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  BUMP_HIGHLIGHT_MS,
  type DemoTab,
  FLY_ANIMATION_MS,
  INITIAL_COUNTS,
  PRIO_ROUTES,
  type PrioChoice,
  RESET_AFTER_MS,
  TAB_TRIAGE,
  TOAST_VISIBLE_MS,
} from './constants';

export interface DemoAnimationState {
  counts: typeof INITIAL_COUNTS;
  ownerTab: DemoTab;
  activeTab: DemoTab;
  selectedPrio: PrioChoice | null;
  pulseOn: boolean;
  flying: boolean;
  bumpedTab: DemoTab | null;
  toastKey: string | null;
  cardRef: React.RefObject<HTMLDivElement | null>;
  triageTabRef: React.RefObject<HTMLButtonElement | null>;
  actionTabRef: React.RefObject<HTMLButtonElement | null>;
  followupTabRef: React.RefObject<HTMLButtonElement | null>;
  handleTabClick: (name: DemoTab) => void;
  handlePrioClick: (prio: PrioChoice) => void;
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
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [counts, setCounts] = useState(INITIAL_COUNTS);
  const [ownerTab, setOwnerTab] = useState<DemoTab>(TAB_TRIAGE);
  const [activeTab, setActiveTab] = useState<DemoTab>(TAB_TRIAGE);
  const [busy, setBusy] = useState(false);
  const [selectedPrio, setSelectedPrio] = useState<PrioChoice | null>(null);
  const [pulseOn, setPulseOn] = useState(true);
  const [flying, setFlying] = useState(false);
  const [bumpedTab, setBumpedTab] = useState<DemoTab | null>(null);
  const [toastKey, setToastKey] = useState<string | null>(null);

  const tabRefs: Record<DemoTab, React.RefObject<HTMLButtonElement | null>> = {
    triage: triageTabRef,
    action: actionTabRef,
    followup: followupTabRef,
  };

  const reset = useCallback(() => {
    setCounts(INITIAL_COUNTS);
    setOwnerTab(TAB_TRIAGE);
    setActiveTab(TAB_TRIAGE);
    setBusy(false);
    setSelectedPrio(null);
    setPulseOn(true);
    setFlying(false);
    setBumpedTab(null);
    setToastKey(null);
    if (cardRef.current) {
      cardRef.current.style.removeProperty('--tx');
      cardRef.current.style.removeProperty('--ty');
    }
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(reset, RESET_AFTER_MS);
  }, [reset]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (flyTimerRef.current) {
        clearTimeout(flyTimerRef.current);
      }
      if (bumpTimerRef.current) {
        clearTimeout(bumpTimerRef.current);
      }
    },
    []
  );

  const handleTabClick = (name: DemoTab) => {
    setActiveTab(name);
    if (ownerTab !== TAB_TRIAGE) {
      scheduleReset();
    }
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

    const tabRect = tabEl.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const tx = tabRect.left + tabRect.width / 2 - (cardRect.left + cardRect.width / 2);
    const ty = tabRect.top + tabRect.height / 2 - (cardRect.top + cardRect.height / 4);
    cardEl.style.setProperty('--tx', `${tx}px`);
    cardEl.style.setProperty('--ty', `${ty}px`);
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
      setToastKey(cfg.toastKeySuffix);
      setBusy(false);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => setToastKey(null), TOAST_VISIBLE_MS);
      if (bumpTimerRef.current) {
        clearTimeout(bumpTimerRef.current);
      }
      bumpTimerRef.current = setTimeout(() => setBumpedTab(null), BUMP_HIGHLIGHT_MS);
      scheduleReset();
    }, FLY_ANIMATION_MS);
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
    cardRef,
    triageTabRef,
    actionTabRef,
    followupTabRef,
    handleTabClick,
    handlePrioClick,
  };
}
