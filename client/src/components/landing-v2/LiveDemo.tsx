/* eslint-disable i18next/no-literal-string, max-lines-per-function */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  BUMP_HIGHLIGHT_MS,
  type DemoTab,
  FLY_ANIMATION_MS,
  INITIAL_COUNTS,
  INITIAL_TRIAGE,
  PRIO_CAN_WAIT,
  PRIO_GET_ON_IT,
  PRIO_OH_SHIT,
  PRIO_ROUTES,
  type PrioChoice,
  RESET_AFTER_MS,
  TAB_ACTION,
  TAB_FOLLOWUP,
  TAB_TRIAGE,
  TOAST_VISIBLE_MS,
} from './constants';

const EMPTY_ICONS: Record<DemoTab, string> = {
  triage: '✨',
  action: '📬',
  followup: '⏳',
};

export const LiveDemo: React.FC = () => {
  const { t } = useTranslation();
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
      setToastKey(cfg.toastKey);
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

  const cardVisible = ownerTab === activeTab;
  const emptyTitle = t(`landing.v2.demo.empty.${activeTab}.title`);
  const emptySub = t(`landing.v2.demo.empty.${activeTab}.sub`);
  const emptyIcon = EMPTY_ICONS[activeTab];
  const topicPill = ownerTab === TAB_TRIAGE && activeTab === TAB_TRIAGE ? INITIAL_TRIAGE : 0;

  return (
    <div className="demo-wrap">
      <div className="chip-float chip-1">
        <span className="ic">⚡</span> {t('landing.v2.demo.floats.urgent')}
      </div>
      <div className="chip-float chip-2">
        <span className="ic">🌙</span> {t('landing.v2.demo.floats.quiet')}
      </div>
      <div className="demo" role="img" aria-label={t('landing.v2.demo.title')}>
        <div className="demo-bar">
          <div className="demo-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="demo-title">{t('landing.v2.demo.title')}</div>
          <div className="demo-clock">
            <span className="live" /> {t('landing.v2.demo.live')}
          </div>
        </div>

        <div className="demo-tabs">
          <DemoTabButton
            name={TAB_TRIAGE}
            label={t('landing.v2.demo.tabs.triage')}
            tabRef={triageTabRef}
            isActive={activeTab === TAB_TRIAGE}
            isBumped={bumpedTab === TAB_TRIAGE}
            count={counts[TAB_TRIAGE]}
            onActivate={handleTabClick}
          />
          <DemoTabButton
            name={TAB_ACTION}
            label={t('landing.v2.demo.tabs.action')}
            tabRef={actionTabRef}
            isActive={activeTab === TAB_ACTION}
            isBumped={bumpedTab === TAB_ACTION}
            count={counts[TAB_ACTION]}
            onActivate={handleTabClick}
          />
          <DemoTabButton
            name={TAB_FOLLOWUP}
            label={t('landing.v2.demo.tabs.followUp')}
            tabRef={followupTabRef}
            isActive={activeTab === TAB_FOLLOWUP}
            isBumped={bumpedTab === TAB_FOLLOWUP}
            count={counts[TAB_FOLLOWUP]}
            onActivate={handleTabClick}
          />
          <div className="demo-tab demo-tab-filter" aria-label="Filter">
            <span className="filter-box" />
          </div>
        </div>

        <div className="demo-batch-banner">
          <span className="banner-emoji">📥</span>
          <span>
            {t('landing.v2.demo.banner.prefix')} <b>{t('landing.v2.demo.banner.time')}</b>{' '}
            {t('landing.v2.demo.banner.suffix')}
          </span>
        </div>

        <div className="topic-group">
          <div className="topic-head">
            <span className="chev">▾</span>
            <span className="topic-ic">👋</span>
            <div className="topic-title">
              <b>{t('landing.v2.demo.topic.prefix')}</b>
              {t('landing.v2.demo.topic.body')}
            </div>
            <span className="topic-pill">{topicPill}</span>
            <span className="topic-action">⚙</span>
            <span className="topic-action">
              🗄 <span className="hide-sm">{t('landing.v2.demo.topic.archiveAll')}</span>
            </span>
          </div>

          <div ref={cardRef} className={`email-card${flying ? ' flying' : ''}`} hidden={!cardVisible}>
            <div className="email-head">
              <div className="email-from">
                <b>{t('landing.v2.demo.email.from')}</b>
                <span className="chip chip-team">{t('landing.v2.demo.email.customerChip')}</span>
                <span className="chip chip-prio">{t('landing.v2.demo.email.priorityChip')}</span>
              </div>
              <div className="email-time">{t('landing.v2.demo.email.receivedAt')}</div>
            </div>
            <div className="email-subj">{t('landing.v2.demo.email.subject')}</div>
            <div className="email-body">{t('landing.v2.demo.email.body')}</div>

            <div className="email-foot">
              <div className="prio-block">
                <div className="prio-label">{t('landing.v2.demo.prioritise.label')}</div>
                <div className="prio-row">
                  <PrioButton
                    prio={PRIO_CAN_WAIT}
                    label={t('landing.v2.demo.prioritise.canWait')}
                    emoji="😪"
                    selected={selectedPrio === PRIO_CAN_WAIT}
                    pulse={false}
                    onClick={handlePrioClick}
                  />
                  <PrioButton
                    prio={PRIO_GET_ON_IT}
                    label={t('landing.v2.demo.prioritise.getOnIt')}
                    emoji="😊"
                    selected={selectedPrio === PRIO_GET_ON_IT}
                    pulse={false}
                    onClick={handlePrioClick}
                  />
                  <PrioButton
                    prio={PRIO_OH_SHIT}
                    label={t('landing.v2.demo.prioritise.ohShit')}
                    emoji="🐻"
                    selected={selectedPrio === PRIO_OH_SHIT}
                    pulse={pulseOn}
                    onClick={handlePrioClick}
                  />
                </div>
              </div>
              <div className="row-actions">
                <span className="row-act">{t('landing.v2.demo.actions.archive')}</span>
                <span className="row-act">{t('landing.v2.demo.actions.snooze')}</span>
                <span className="row-act">{t('landing.v2.demo.actions.block')}</span>
              </div>
            </div>
          </div>

          {!cardVisible && (
            <div className="empty-state">
              <div className="empty-ic">{emptyIcon}</div>
              <div className="empty-title">{emptyTitle}</div>
              <div className="empty-sub">{emptySub}</div>
            </div>
          )}
        </div>

        <div className={`routed-toast${toastKey ? ' show' : ''}`} aria-live="polite">
          {toastKey && (
            <>
              <span className="dot" />
              {t(toastKey)}
            </>
          )}
        </div>

        <div className="demo-foot">
          <div className="nextbatch">
            ⏱ {t('landing.v2.demo.foot.nextBatch')} <b className="batch-time">{t('landing.v2.demo.banner.time')}</b>
          </div>
          <div>
            {t('landing.v2.demo.foot.summary', {
              triage: counts[TAB_TRIAGE],
              action: counts[TAB_ACTION],
              followup: counts[TAB_FOLLOWUP],
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== Internal helpers =====

interface DemoTabButtonProps {
  name: DemoTab;
  label: string;
  tabRef: React.RefObject<HTMLButtonElement | null>;
  isActive: boolean;
  isBumped: boolean;
  count: number;
  onActivate: (name: DemoTab) => void;
}

const DemoTabButton: React.FC<DemoTabButtonProps> = ({
  name,
  label,
  tabRef,
  isActive,
  isBumped,
  count,
  onActivate,
}) => (
  <button
    type="button"
    ref={tabRef}
    className={`demo-tab${isActive ? ' active' : ''}${isBumped ? ' bump' : ''}`}
    onClick={() => onActivate(name)}
  >
    {label} <span className="count">{count}</span>
  </button>
);

interface PrioButtonProps {
  prio: PrioChoice;
  label: string;
  emoji: string;
  selected: boolean;
  pulse: boolean;
  onClick: (prio: PrioChoice) => void;
}

const PrioButton: React.FC<PrioButtonProps> = ({ prio, label, emoji, selected, pulse, onClick }) => (
  <button
    type="button"
    className={`prio-btn${pulse ? ' pulse' : ''}${selected ? ' active' : ''}`}
    onClick={() => onClick(prio)}
  >
    <span className="emo">{emoji}</span>
    <span className="emo-l">{label}</span>
  </button>
);
