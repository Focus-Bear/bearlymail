import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  BUMP_HIGHLIGHT_MS,
  CARD_ANIM_FLYING,
  CARD_ANIM_JUST_MOVED,
  CARD_ANIM_SNOOZING,
  type CardAnim,
  type DemoTab,
  FLY_ANIMATION_MS,
  JUST_MOVED_MS,
  PRIO_GET_ON_IT,
  type PrioChoice,
  RICH_CARDS_BY_ID,
  RICH_INITIAL_LISTS,
  RICH_PRIO_ROUTES,
  RICH_RESET_AFTER_MS,
  RICH_TOAST_VISIBLE_MS,
  RICH_TOUR_STEPS,
  type RichTourStep,
  SNOOZE_OUT_MS,
  TAB_ACTION,
  TAB_FOLLOWUP,
  TAB_TRIAGE,
  TOUR_AUTORUN_DELAY_MS,
  TOUR_EDGE_GAP,
  TOUR_POP_GAP,
  TOUR_SESSION_KEY,
  TOUR_SPOTLIGHT_PAD,
  TOUR_STEP_PRIORITY_SCORE,
  TOUR_STEP_SORTED,
} from './constants';

type Lists = Record<DemoTab, string[]>;

export interface TourGeometry {
  spot: { x: number; y: number; w: number; h: number };
  dimTop: { x: number; y: number; w: number; h: number };
  dimBottom: { x: number; y: number; w: number; h: number };
  dimLeft: { x: number; y: number; w: number; h: number };
  dimRight: { x: number; y: number; w: number; h: number };
  pop: { x: number; y: number };
}

const ZERO_BOX = { x: 0, y: 0, w: 0, h: 0 };
const INITIAL_TOUR_GEOMETRY: TourGeometry = {
  spot: ZERO_BOX,
  dimTop: ZERO_BOX,
  dimBottom: ZERO_BOX,
  dimLeft: ZERO_BOX,
  dimRight: ZERO_BOX,
  pop: { x: 0, y: 0 },
};

function cloneInitialLists(): Lists {
  return {
    triage: [...RICH_INITIAL_LISTS[TAB_TRIAGE]],
    action: [...RICH_INITIAL_LISTS[TAB_ACTION]],
    followup: [...RICH_INITIAL_LISTS[TAB_FOLLOWUP]],
  };
}

function initialSelectedPrio(): Record<string, PrioChoice> {
  return RICH_INITIAL_LISTS[TAB_ACTION].reduce<Record<string, PrioChoice>>(
    (acc, id) => ({ ...acc, [id]: PRIO_GET_ON_IT }),
    {}
  );
}

/** Insert a card id into an Action list keeping it ranked by descending score. */
function insertByScore(list: string[], id: string): string[] {
  const score = RICH_CARDS_BY_ID[id]?.score ?? -1;
  const idx = list.findIndex(other => (RICH_CARDS_BY_ID[other]?.score ?? -1) < score);
  if (idx === -1) {
    return [...list, id];
  }
  return [...list.slice(0, idx), id, ...list.slice(idx)];
}

export interface RichDemoState {
  lists: Lists;
  activeTab: DemoTab;
  counts: Record<DemoTab, number>;
  openIds: Set<string>;
  sentIds: Set<string>;
  selectedPrio: Record<string, PrioChoice>;
  anim: Record<string, CardAnim | undefined>;
  flyingActive: boolean;
  bumpedTab: DemoTab | null;
  engaged: boolean;
  toast: string | null;
  pulseCardId: string | null;
  // tour
  tourOn: boolean;
  tourIdx: number;
  tourStep: RichTourStep;
  tourGeometry: TourGeometry;
  // refs
  demoRef: React.RefObject<HTMLDivElement | null>;
  panesRef: React.RefObject<HTMLDivElement | null>;
  popRef: React.RefObject<HTMLDivElement | null>;
  setCardRef: (id: string, el: HTMLElement | null) => void;
  setTabRef: (tab: DemoTab, el: HTMLElement | null) => void;
  // handlers
  selectTab: (tab: DemoTab) => void;
  prioritise: (cardId: string, prio: PrioChoice) => void;
  archive: (cardId: string) => void;
  toggleOpen: (cardId: string) => void;
  sendFollowup: (cardId: string) => void;
  openSignup: () => void;
  startTour: () => void;
  nextTourStep: () => void;
  endTour: () => void;
}

// eslint-disable-next-line max-lines-per-function
export function useRichDemo(onSignup: () => void): RichDemoState {
  const demoRef = useRef<HTMLDivElement | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const tabRefs = useRef<Record<DemoTab, HTMLElement | null>>({
    triage: null,
    action: null,
    followup: null,
  });

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [lists, setLists] = useState<Lists>(cloneInitialLists);
  const [activeTab, setActiveTab] = useState<DemoTab>(TAB_TRIAGE);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [selectedPrio, setSelectedPrio] = useState<Record<string, PrioChoice>>(initialSelectedPrio);
  const [anim, setAnim] = useState<Record<string, CardAnim | undefined>>({});
  const [flyingActive, setFlyingActive] = useState(false);
  const [bumpedTab, setBumpedTab] = useState<DemoTab | null>(null);
  const [engaged, setEngaged] = useState(false);
  const engagedRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    engagedRef.current = engaged;
  }, [engaged]);
  const [tourOn, setTourOn] = useState(false);
  const [tourIdx, setTourIdx] = useState(0);
  const [tourGeometry, setTourGeometry] = useState<TourGeometry>(INITIAL_TOUR_GEOMETRY);

  const setCardRef = useCallback((id: string, el: HTMLElement | null) => {
    cardRefs.current[id] = el;
  }, []);
  const setTabRef = useCallback((tab: DemoTab, el: HTMLElement | null) => {
    tabRefs.current[tab] = el;
  }, []);

  const track = useCallback((callback: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      callback();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    },
    []
  );

  const liveCount = useCallback(
    (tab: DemoTab) => lists[tab].filter(id => anim[id] !== CARD_ANIM_SNOOZING).length,
    [lists, anim]
  );
  const counts: Record<DemoTab, number> = {
    triage: liveCount(TAB_TRIAGE),
    action: liveCount(TAB_ACTION),
    followup: liveCount(TAB_FOLLOWUP),
  };

  // The guided pulse always sits on the top *live* Triage card.
  const pulseCardId =
    lists[TAB_TRIAGE].find(id => anim[id] !== CARD_ANIM_SNOOZING && anim[id] !== CARD_ANIM_FLYING) ??
    null;

  const showToast = useCallback((key: string) => {
    setToast(key);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), RICH_TOAST_VISIBLE_MS);
  }, []);

  const reset = useCallback(() => {
    setLists(cloneInitialLists());
    setActiveTab(TAB_TRIAGE);
    setOpenIds(new Set());
    setSentIds(new Set());
    setSelectedPrio(initialSelectedPrio());
    setAnim({});
    setFlyingActive(false);
    setBumpedTab(null);
    setEngaged(false);
    setToast(null);
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(reset, RICH_RESET_AFTER_MS);
  }, [reset]);

  const setCardAnim = useCallback((id: string, value: CardAnim | undefined) => {
    setAnim(prev => {
      const next = { ...prev };
      if (value) {
        next[id] = value;
      } else {
        delete next[id];
      }
      return next;
    });
  }, []);

  const bump = useCallback(
    (tab: DemoTab) => {
      setBumpedTab(tab);
      track(() => setBumpedTab(null), BUMP_HIGHLIGHT_MS);
    },
    [track]
  );

  const removeFromTriage = useCallback(
    (cardId: string, toastKey: string) => {
      setCardAnim(cardId, CARD_ANIM_SNOOZING);
      showToast(toastKey);
      track(() => {
        setLists(prev => ({ ...prev, [TAB_TRIAGE]: prev[TAB_TRIAGE].filter(id => id !== cardId) }));
        setCardAnim(cardId, undefined);
      }, SNOOZE_OUT_MS);
      scheduleReset();
    },
    [scheduleReset, setCardAnim, showToast, track]
  );

  const flyToAction = useCallback(
    (cardId: string, toastKey: string) => {
      const cardEl = cardRefs.current[cardId];
      const tabEl = tabRefs.current[TAB_ACTION];
      if (cardEl && tabEl) {
        const tabRect = tabEl.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        const tx = tabRect.left + tabRect.width / 2 - (cardRect.left + cardRect.width / 2);
        const ty = tabRect.top + tabRect.height / 2 - (cardRect.top + cardRect.height / 4);
        cardEl.style.setProperty('--tx', `${tx}px`);
        cardEl.style.setProperty('--ty', `${ty}px`);
      }
      setFlyingActive(true);
      setCardAnim(cardId, CARD_ANIM_FLYING);

      track(() => {
        if (cardEl) {
          cardEl.style.removeProperty('--tx');
          cardEl.style.removeProperty('--ty');
        }
        setFlyingActive(false);
        setOpenIds(prev => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        setLists(prev => ({
          ...prev,
          [TAB_TRIAGE]: prev[TAB_TRIAGE].filter(id => id !== cardId),
          [TAB_ACTION]: insertByScore(prev[TAB_ACTION], cardId),
        }));
        setCardAnim(cardId, CARD_ANIM_JUST_MOVED);
        track(() => setCardAnim(cardId, undefined), JUST_MOVED_MS);
        bump(TAB_ACTION);
        showToast(toastKey);
        scheduleReset();
      }, FLY_ANIMATION_MS);
    },
    [bump, scheduleReset, setCardAnim, showToast, track]
  );

  const prioritise = useCallback(
    (cardId: string, prio: PrioChoice) => {
      setEngaged(true);
      const inTriage = lists[TAB_TRIAGE].includes(cardId);
      if (!inTriage) {
        setSelectedPrio(prev => ({ ...prev, [cardId]: prio }));
        return;
      }
      if (anim[cardId]) {
        return;
      }
      const route = RICH_PRIO_ROUTES[prio];
      setSelectedPrio(prev => ({ ...prev, [cardId]: prio }));
      if (route.snooze) {
        removeFromTriage(cardId, route.toast);
        return;
      }
      flyToAction(cardId, route.toast);
    },
    [anim, flyToAction, lists, removeFromTriage]
  );

  const archive = useCallback(
    (cardId: string) => {
      setEngaged(true);
      if (!lists[TAB_TRIAGE].includes(cardId) || anim[cardId]) {
        return;
      }
      removeFromTriage(cardId, 'routed.archived');
    },
    [anim, lists, removeFromTriage]
  );

  const toggleOpen = useCallback(
    (cardId: string) => {
      setEngaged(true);
      setOpenIds(prev => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else {
          next.add(cardId);
        }
        return next;
      });
      scheduleReset();
    },
    [scheduleReset]
  );

  const sendFollowup = useCallback(
    (cardId: string) => {
      setEngaged(true);
      setSentIds(prev => new Set(prev).add(cardId));
      showToast('routed.followupSent');
      scheduleReset();
    },
    [scheduleReset, showToast]
  );

  const openSignup = useCallback(() => {
    setEngaged(true);
    onSignup();
  }, [onSignup]);

  const selectTab = useCallback(
    (tab: DemoTab) => {
      setActiveTab(tab);
      scheduleReset();
    },
    [scheduleReset]
  );

  // ===== Mini product tour =====
  const tourStep = RICH_TOUR_STEPS[tourIdx];

  const tourTarget = useCallback((step: RichTourStep): HTMLElement | null => {
    const demo = demoRef.current;
    if (!demo) {
      return null;
    }
    const triagePane = demo.querySelector('[data-pane="triage"]');
    if (step === TOUR_STEP_SORTED) {
      return triagePane?.querySelector<HTMLElement>('.card-stack') ?? null;
    }
    const firstCard = triagePane?.querySelector<HTMLElement>('.email-card');
    if (step === TOUR_STEP_PRIORITY_SCORE) {
      return firstCard?.querySelector<HTMLElement>('.chip-prio') ?? null;
    }
    return firstCard?.querySelector<HTMLElement>('[data-prio="oh-shit"]') ?? null;
  }, []);

  const positionTour = useCallback(() => {
    const demo = demoRef.current;
    const target = tourTarget(RICH_TOUR_STEPS[tourIdx]);
    const pop = popRef.current;
    if (!demo || !target) {
      return;
    }
    const dr = demo.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const pad = TOUR_SPOTLIGHT_PAD;
    const x = Math.max(0, tr.left - dr.left - pad);
    const y = Math.max(0, tr.top - dr.top - pad);
    const spotW = tr.width + pad * 2;
    const spotH = tr.height + pad * 2;
    const demoW = dr.width;
    const demoH = dr.height;
    const pw = pop?.offsetWidth ?? 0;
    const ph = pop?.offsetHeight ?? 0;
    const below = y + spotH + TOUR_POP_GAP;
    const py = below + ph <= demoH - TOUR_EDGE_GAP ? below : Math.max(TOUR_EDGE_GAP, y - ph - TOUR_POP_GAP);
    const px = Math.min(Math.max(TOUR_EDGE_GAP, x + spotW / 2 - pw / 2), demoW - TOUR_EDGE_GAP - pw);
    setTourGeometry({
      spot: { x, y, w: spotW, h: spotH },
      dimTop: { x: 0, y: 0, w: demoW, h: y },
      dimBottom: { x: 0, y: y + spotH, w: demoW, h: Math.max(0, demoH - (y + spotH)) },
      dimLeft: { x: 0, y, w: x, h: spotH },
      dimRight: { x: x + spotW, y, w: Math.max(0, demoW - (x + spotW)), h: spotH },
      pop: { x: px, y: py },
    });
  }, [tourIdx, tourTarget]);

  const endTour = useCallback(() => {
    setTourOn(false);
    try {
      sessionStorage.setItem(TOUR_SESSION_KEY, '1');
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }
  }, []);

  const startTour = useCallback(() => {
    if (panesRef.current) {
      panesRef.current.scrollTop = 0;
    }
    setTourIdx(0);
    setTourOn(true);
  }, []);

  const nextTourStep = useCallback(() => {
    setTourIdx(prev => {
      if (prev < RICH_TOUR_STEPS.length - 1) {
        return prev + 1;
      }
      endTour();
      return prev;
    });
  }, [endTour]);

  useLayoutEffect(() => {
    if (!tourOn) {
      return undefined;
    }
    positionTour();
    const onResize = (): void => positionTour();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tourOn, tourIdx, positionTour]);

  // Auto-run the tour once per session, unless the user has already engaged.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(TOUR_SESSION_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) {
      return undefined;
    }
    const id = setTimeout(() => {
      if (!engagedRef.current) {
        startTour();
      }
    }, TOUR_AUTORUN_DELAY_MS);
    return () => clearTimeout(id);
  }, [startTour]);

  return {
    lists,
    activeTab,
    counts,
    openIds,
    sentIds,
    selectedPrio,
    anim,
    flyingActive,
    bumpedTab,
    engaged,
    toast,
    pulseCardId,
    tourOn,
    tourIdx,
    tourStep,
    tourGeometry,
    demoRef,
    panesRef,
    popRef,
    setCardRef,
    setTabRef,
    selectTab,
    prioritise,
    archive,
    toggleOpen,
    sendFollowup,
    openSignup,
    startTour,
    nextTourStep,
    endTour,
  };
}
