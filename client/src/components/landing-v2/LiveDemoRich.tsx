/* eslint-disable i18next/no-literal-string, max-lines-per-function */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { EmergencyDeliveryRibbon } from 'components/inbox/EmergencyDeliveryRibbon';

import {
  CARD_VARIANT_FOLLOWUP,
  CARD_VARIANT_URGENT,
  type DemoTab,
  PRIO_CAN_WAIT,
  PRIO_GET_ON_IT,
  PRIO_OH_SHIT,
  type PrioChoice,
  PULSE_ARCHIVE,
  RICH_CARDS_BY_ID,
  RICH_TOUR_STEPS,
  type RichDemoCard,
  ROW_ACTION_ARCHIVE,
  type RowAction,
  TAB_ACTION,
  TAB_FOLLOWUP,
  TAB_TRIAGE,
} from './constants';
import { type RichDemoState, useRichDemo } from './useRichDemo';
import { openWaitlist } from './waitlistStore';

const DEMO_PREFIX = 'landing.v2.demo';

const TIER_CLASS: Record<RichDemoCard['tier'], string> = {
  high: 'chip-prio',
  med: 'chip-prio chip-prio-med',
  low: 'chip-prio chip-prio-low',
};

const PRIO_EMOJI: Record<PrioChoice, string> = {
  'can-wait': '😊',
  'get-on-it': '😀',
  'oh-shit': '🧨',
};

const PRIO_ORDER: PrioChoice[] = [PRIO_CAN_WAIT, PRIO_GET_ON_IT, PRIO_OH_SHIT];

const PRIO_I18N: Record<PrioChoice, string> = {
  'can-wait': 'canWait',
  'get-on-it': 'getOnIt',
  'oh-shit': 'ohShit',
};

interface LocalT {
  (suffix: string, options?: Record<string, unknown>): string;
}

export const LiveDemoRich: React.FC = () => {
  const { t } = useTranslation();
  const localT: LocalT = (suffix, options) =>
    options ? t(`${DEMO_PREFIX}.${suffix}`, options) : t(`${DEMO_PREFIX}.${suffix}`);

  const demo = useRichDemo(() => openWaitlist());

  return (
    <div className="demo-wrap demo-rich">
      <div className="demo-callout" aria-hidden="true">
        <span className="label">{localT('calloutLabel')}</span>
        <svg
          className="arrow"
          viewBox="0 0 84 62"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 9 C 34 4, 66 14, 70 46" />
          <path d="M57 39 L71 50 L78 35" />
        </svg>
      </div>

      <div
        ref={demo.demoRef}
        className={`demo${demo.engaged ? ' engaged' : ''}`}
        role="group"
        aria-label={localT('title')}
      >
        <div className="demo-bar">
          <div className="demo-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="demo-title">{localT('title')}</div>
          <div className="demo-clock">
            <button
              type="button"
              className="tour-replay"
              onClick={demo.startTour}
              title={localT('tourReplayTitle')}
            >
              {localT('tourReplay')}
            </button>
            <span className="live" /> {localT('live')}
          </div>
        </div>

        <TourOverlay demo={demo} localT={localT} />

        <div className="demo-tabs">
          <DemoTab demo={demo} tab={TAB_TRIAGE} label={localT('tabs.triage')} />
          <DemoTab demo={demo} tab={TAB_ACTION} label={localT('tabs.action')} />
          <DemoTab demo={demo} tab={TAB_FOLLOWUP} label={localT('tabs.followUp')} />
          <div className="demo-tab demo-tab-filter" aria-label={localT('filter')}>
            <span className="filter-box" />
          </div>
        </div>

        <div className="demo-batch-banner">
          <span className="banner-emoji">📥</span>
          <span>
            {localT('banner.prefix')} <b>{localT('banner.time')}</b> {localT('banner.suffix')}
          </span>
        </div>

        <div ref={demo.panesRef} className={`demo-panes${demo.flyingActive ? ' flying-active' : ''}`}>
          <DemoPane
            demo={demo}
            localT={localT}
            tab={TAB_TRIAGE}
            topicIc="👋"
            hasEmpty
          />
          <DemoPane demo={demo} localT={localT} tab={TAB_ACTION} topicIc="📌" />
          <DemoPane demo={demo} localT={localT} tab={TAB_FOLLOWUP} topicIc="↩️" hasEmpty />
        </div>

        <div className={`routed-toast${demo.toast ? ' show' : ''}`} aria-live="polite">
          {demo.toast && (
            <>
              <span className="dot" />
              {localT(demo.toast)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== Tabs =====

const DemoTab: React.FC<{ demo: RichDemoState; tab: DemoTab; label: string }> = ({
  demo,
  tab,
  label,
}) => (
  <button
    type="button"
    ref={el => demo.setTabRef(tab, el)}
    className={`demo-tab${demo.activeTab === tab ? ' active' : ''}${
      demo.bumpedTab === tab ? ' bump' : ''
    }`}
    onClick={() => demo.selectTab(tab)}
  >
    {label} <span className="count">{demo.counts[tab]}</span>
  </button>
);

// ===== Panes =====

const DemoPane: React.FC<{
  demo: RichDemoState;
  localT: LocalT;
  tab: DemoTab;
  topicIc: string;
  hasEmpty?: boolean;
}> = ({ demo, localT, tab, topicIc, hasEmpty = false }) => {
  const ids = demo.lists[tab];
  const isEmpty = hasEmpty && demo.counts[tab] === 0;
  const isTriage = tab === TAB_TRIAGE;

  return (
    <div className="demo-pane" data-pane={tab} hidden={demo.activeTab !== tab}>
      <div className="topic-head">
        <span className="chev">▾</span>
        <span className="topic-ic">{topicIc}</span>
        <div className="topic-title">
          <b>{localT(`topics.${tab}.prefix`)}</b>
          {localT(`topics.${tab}.body`)}
        </div>
        <span className="topic-pill">{demo.counts[tab]}</span>
        <span className="topic-action" title={localT('settings')}>
          ⚙
        </span>
        {isTriage && (
          <span className="topic-action" title={localT('topic.archiveAll')}>
            🗄 <span className="hide-sm">{localT('topic.archiveAll')}</span>
          </span>
        )}
      </div>

      <div className="card-stack" hidden={isEmpty}>
        {ids.map(id => (
          <EmailCard key={id} demo={demo} localT={localT} cardId={id} tab={tab} />
        ))}
      </div>

      {isEmpty && (
        <div className="empty-state">
          <div className="empty-ic">{localT(`empty.${tab}.icon`)}</div>
          <div className="empty-title">{localT(`empty.${tab}.title`)}</div>
          <div className="empty-sub">{localT(`empty.${tab}.sub`)}</div>
        </div>
      )}
    </div>
  );
};

// ===== Email card =====

const ROW_ACTION_KEY: Record<RowAction, string> = {
  archive: 'actions.archive',
  snooze: 'actions.snooze',
  block: 'actions.block',
};

const EmailCard: React.FC<{
  demo: RichDemoState;
  localT: LocalT;
  cardId: string;
  tab: DemoTab;
}> = ({ demo, localT, cardId, tab }) => {
  const card = RICH_CARDS_BY_ID[cardId];
  const isFollowup = card.variant === CARD_VARIANT_FOLLOWUP;
  const isUrgent = card.variant === CARD_VARIANT_URGENT;
  const isOpen = demo.openIds.has(cardId);
  const isTriage = tab === TAB_TRIAGE;
  const animClass = demo.anim[cardId] ? ` ${demo.anim[cardId]}` : '';
  // The guided pulse follows the top live Triage card through the whole queue
  // (aria → sam → notion), so it keeps pointing at the next recommended action
  // even after the user has started prioritising.
  const isPulseCard = isTriage && demo.pulseCardId === cardId;

  const classNames = [
    'email-card',
    isUrgent ? 'urgent-card' : '',
    isFollowup ? 'fu-card' : '',
    isOpen ? 'open' : '',
    animClass.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      ref={el => demo.setCardRef(cardId, el)}
      className={classNames}
      onClick={() => demo.toggleOpen(cardId)}
    >
      {isUrgent && <EmergencyDeliveryRibbon />}

      <div className="email-head">
        <div className="email-from">
          <span className="sender">{localT(`cards.${cardId}.sender`)}</span>
          {isFollowup ? (
            <span className="chip chip-wait">{localT(`cards.${cardId}.waitChip`)}</span>
          ) : (
            <>
              <span className="chip chip-team">{localT(`cards.${cardId}.contactChip`)}</span>
              <span className={`chip ${TIER_CLASS[card.tier]}`}>
                {localT(`cards.${cardId}.priorityLabel`)}
              </span>
            </>
          )}
        </div>
        <div className="email-time">{localT(`cards.${cardId}.time`)}</div>
      </div>

      <div className="email-subj">{localT(`cards.${cardId}.subject`)}</div>
      <div className="email-preview">{localT(`cards.${cardId}.preview`)}</div>

      <button
        type="button"
        className="read-toggle"
        aria-expanded={isOpen}
        onClick={event => {
          event.stopPropagation();
          demo.toggleOpen(cardId);
        }}
      >
        {localT(isFollowup ? 'readSent' : 'readReceived')} <span className="chev">▾</span>
      </button>
      <div className="email-detail">{localT(`cards.${cardId}.detail`)}</div>

      {!isFollowup && isOpen && (
        <div className="reply-lock">
          <span className="reply-lock-ic" aria-hidden="true">
            🔒
          </span>
          <span className="reply-lock-txt">{localT('replyLock.text')}</span>
          <button
            type="button"
            className="reply-lock-cta"
            onClick={event => {
              event.stopPropagation();
              demo.openSignup();
            }}
          >
            {localT('replyLock.cta')}
          </button>
        </div>
      )}

      <div className="email-foot">
        {isFollowup ? (
          <button
            type="button"
            className={`fu-send${demo.sentIds.has(cardId) ? ' sent' : ''}`}
            onClick={event => {
              event.stopPropagation();
              if (!demo.sentIds.has(cardId)) {
                demo.sendFollowup(cardId);
              }
            }}
          >
            {demo.sentIds.has(cardId) ? localT('followupSent') : localT('followupSend')}
          </button>
        ) : (
          <div className="prio-block">
            <div className="prio-label">{localT('prioritise.label')}</div>
            <div className="prio-row">
              {PRIO_ORDER.map(prio => {
                const pulse = isPulseCard && card.pulse === prio;
                const selected = demo.selectedPrio[cardId] === prio;
                return (
                  <button
                    key={prio}
                    type="button"
                    data-prio={prio}
                    className={`prio-btn${pulse ? ' pulse' : ''}${selected ? ' active' : ''}`}
                    onClick={event => {
                      event.stopPropagation();
                      demo.prioritise(cardId, prio);
                    }}
                  >
                    <span className="emo">{PRIO_EMOJI[prio]}</span>
                    <span className="emo-l">{localT(`prioritise.${PRIO_I18N[prio]}`)}</span>
                  </button>
                );
              })}
              {isPulseCard && card.pulse && card.pulse !== PULSE_ARCHIVE && (
                <span className="tap-hint" aria-hidden="true">
                  <span className="ring" />
                  <svg className="cursor" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 2.5 L5 18.5 L9.2 14.3 L12 20.5 L14.6 19.4 L11.8 13.2 L17.5 13.2 Z"
                      fill="#141414"
                      stroke="#fff"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="row-actions">
          {card.rowActions.map(action => {
            const pulse =
              isPulseCard && card.pulse === PULSE_ARCHIVE && action === ROW_ACTION_ARCHIVE;
            return (
              <button
                key={action}
                type="button"
                className={`row-act${pulse ? ' pulse' : ''}`}
                onClick={event => {
                  event.stopPropagation();
                  if (action === ROW_ACTION_ARCHIVE && isTriage) {
                    demo.archive(cardId);
                  }
                }}
              >
                {localT(ROW_ACTION_KEY[action])}
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
};

// ===== Tour overlay =====

/** Splits an i18n string on a single <b>…</b> segment into React nodes, so we
 * can render the emphasised phrase without dangerouslySetInnerHTML. */
const renderEmphasis = (text: string): React.ReactNode => {
  const parts = text.split(/<b>(.*?)<\/b>/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? <b key={`b-${index}`}>{part}</b> : <React.Fragment key={`t-${index}`}>{part}</React.Fragment>
  );
};

const TourOverlay: React.FC<{ demo: RichDemoState; localT: LocalT }> = ({ demo, localT }) => {
  const geometry = demo.tourGeometry;
  const boxStyle = (box: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
  });
  const isLast = demo.tourIdx === RICH_TOUR_STEPS.length - 1;

  return (
    <div className={`tour${demo.tourOn ? ' on' : ''}`} aria-hidden={!demo.tourOn}>
      <div className="tour-dim" style={boxStyle(geometry.dimTop)} />
      <div className="tour-dim" style={boxStyle(geometry.dimBottom)} />
      <div className="tour-dim" style={boxStyle(geometry.dimLeft)} />
      <div className="tour-dim" style={boxStyle(geometry.dimRight)} />
      <div className="tour-spot" style={boxStyle(geometry.spot)} />
      <div ref={demo.popRef} className="tour-pop" style={{ left: geometry.pop.x, top: geometry.pop.y }}>
        <div className="step-dots">
          {RICH_TOUR_STEPS.map((step, index) => (
            <i key={step} className={demo.tourIdx === index ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-txt">{renderEmphasis(localT(`tour.${demo.tourStep}`))}</div>
        <div className="tour-row">
          <button type="button" className="tour-skip" onClick={demo.endTour}>
            {localT('tour.skip')}
          </button>
          <button type="button" className="tour-next" onClick={demo.nextTourStep}>
            {localT(isLast ? 'tour.done' : 'tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
};
