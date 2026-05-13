/* eslint-disable i18next/no-literal-string, max-lines-per-function */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { EmergencyDeliveryRibbon } from 'components/inbox/EmergencyDeliveryRibbon';

import {
  type DemoTab,
  INITIAL_TRIAGE,
  PRIO_CAN_WAIT,
  PRIO_GET_ON_IT,
  PRIO_OH_SHIT,
  type PrioChoice,
  TAB_ACTION,
  TAB_FOLLOWUP,
  TAB_TRIAGE,
} from './constants';
import { useDemoAnimation } from './useDemoAnimation';

const EMPTY_ICONS: Record<DemoTab, string> = {
  triage: '✨',
  action: '📬',
  followup: '⏳',
};

const DEFAULT_DEMO_PREFIX = 'landing.v2.demo';

interface LiveDemoProps {
  /** Root i18n key for the demo strings (without trailing dot). Defaults to
   * landing.v2.demo so the original landing keeps working unchanged. */
  i18nPrefix?: string;
}

export const LiveDemo: React.FC<LiveDemoProps> = ({ i18nPrefix = DEFAULT_DEMO_PREFIX }) => {
  const { t } = useTranslation();
  const localT = (suffix: string, options?: Record<string, unknown>): string =>
    options ? t(`${i18nPrefix}.${suffix}`, options) : t(`${i18nPrefix}.${suffix}`);

  const {
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
  } = useDemoAnimation();

  const cardVisible = ownerTab === activeTab;
  const emptyTitle = localT(`empty.${activeTab}.title`);
  const emptySub = localT(`empty.${activeTab}.sub`);
  const emptyIcon = EMPTY_ICONS[activeTab];
  const topicPill = ownerTab === TAB_TRIAGE && activeTab === TAB_TRIAGE ? INITIAL_TRIAGE : 0;

  return (
    <div className="demo-wrap">
      <div className="chip-float chip-1">
        <span className="ic">⚡</span> {localT('floats.urgent')}
      </div>
      <div className="demo" role="img" aria-label={localT('title')}>
        <div className="demo-bar">
          <div className="demo-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="demo-title">{localT('title')}</div>
          <div className="demo-clock">
            <span className="live" /> {localT('live')}
          </div>
        </div>

        <div className="demo-tabs">
          <DemoTabButton
            name={TAB_TRIAGE}
            label={localT('tabs.triage')}
            tabRef={triageTabRef}
            isActive={activeTab === TAB_TRIAGE}
            isBumped={bumpedTab === TAB_TRIAGE}
            count={counts[TAB_TRIAGE]}
            onActivate={handleTabClick}
          />
          <DemoTabButton
            name={TAB_ACTION}
            label={localT('tabs.action')}
            tabRef={actionTabRef}
            isActive={activeTab === TAB_ACTION}
            isBumped={bumpedTab === TAB_ACTION}
            count={counts[TAB_ACTION]}
            onActivate={handleTabClick}
          />
          <DemoTabButton
            name={TAB_FOLLOWUP}
            label={localT('tabs.followUp')}
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
            {localT('banner.prefix')} <b>{localT('banner.time')}</b>{' '}
            {localT('banner.suffix')}
          </span>
        </div>

        <div className="topic-group">
          <div className="topic-head">
            <span className="chev">▾</span>
            <span className="topic-ic">👋</span>
            <div className="topic-title">
              <b>{localT('topic.prefix')}</b>
              {localT('topic.body')}
            </div>
            <span className="topic-pill">{topicPill}</span>
            <span className="topic-action">⚙</span>
            <span className="topic-action">
              🗄 <span className="hide-sm">{localT('topic.archiveAll')}</span>
            </span>
          </div>

          <div
            ref={cardRef}
            className={`email-card email-card-with-ribbon${flying ? ' flying' : ''}`}
            hidden={!cardVisible}
          >
            <EmergencyDeliveryRibbon />
            <div className="email-head">
              <div className="email-from">
                <b>{localT('email.from')}</b>
                <span className="chip chip-team">{localT('email.customerChip')}</span>
                <span className="chip chip-prio">{localT('email.priorityChip')}</span>
              </div>
              <div className="email-time">{localT('email.receivedAt')}</div>
            </div>
            <div className="email-subj">{localT('email.subject')}</div>
            <div className="email-body">{localT('email.body')}</div>

            <div className="email-foot">
              <div className="prio-block">
                <div className="prio-label">{localT('prioritise.label')}</div>
                <div className="prio-row">
                  <PrioButton
                    prio={PRIO_CAN_WAIT}
                    label={localT('prioritise.canWait')}
                    emoji="😪"
                    selected={selectedPrio === PRIO_CAN_WAIT}
                    pulse={false}
                    onClick={handlePrioClick}
                  />
                  <PrioButton
                    prio={PRIO_GET_ON_IT}
                    label={localT('prioritise.getOnIt')}
                    emoji="😊"
                    selected={selectedPrio === PRIO_GET_ON_IT}
                    pulse={false}
                    onClick={handlePrioClick}
                  />
                  <PrioButton
                    prio={PRIO_OH_SHIT}
                    label={localT('prioritise.ohShit')}
                    emoji="🐻"
                    selected={selectedPrio === PRIO_OH_SHIT}
                    pulse={pulseOn}
                    onClick={handlePrioClick}
                  />
                </div>
              </div>
              <div className="row-actions">
                <span className="row-act">{localT('actions.archive')}</span>
                <span className="row-act">{localT('actions.snooze')}</span>
                <span className="row-act">{localT('actions.block')}</span>
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
              {localT(toastKey)}
            </>
          )}
        </div>

        <div className="demo-foot">
          <div className="nextbatch">
            ⏱ {localT('foot.nextBatch')} <b className="batch-time">{localT('banner.time')}</b>
          </div>
          <div>
            {localT('foot.summary', {
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
