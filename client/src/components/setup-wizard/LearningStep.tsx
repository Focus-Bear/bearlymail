import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import axios from 'axios';

import { ConnectMailboxButton } from 'components/connect-mailbox/ConnectMailboxButton';
import { API_URL } from 'config/api';
import { MS_PER_SECOND, POLLING_INTERVAL_MS, SECONDS_PER_MINUTE } from 'constants/numbers';
import { useAnalysisProgress } from 'hooks/settings/useAnalysisProgress';
import { MAILBOX_STATUS, useMailboxConnection } from 'hooks/useMailboxConnection';

import { LearnedContextEditor } from './learned-context/LearnedContextEditor';
import {
  buildRowCount,
  buildStatusDetail,
  computeLearningView,
  hasLearningFinished,
  type ImportProgress,
  PHASE_LABEL_KEYS,
  type RealProgress,
  type TFn,
} from './learning-view';
import { onboardingPrimaryButtonStyle as primaryButtonStyle } from './onboarding-buttons';
import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';
import { CategoryCountsPanel } from './recategorise/CategoryCountsPanel';
import { RECATEGORISE_STATUS } from './recategorise/recategorise';
import { type RecategoriseState, useRecategorise } from './recategorise/useRecategorise';
import { useCategorisationProgress } from './useCategorisationProgress';

interface LearningStepProps {
  onComplete: () => void;
  onBack: () => void;
  isLoading: boolean;
}

const IMPORT_TIMEOUT_MINUTES = 5;
const IMPORT_TIMEOUT_MS = IMPORT_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const HEADER_STATE_WORKING = 'working';
const HEADER_STATE_STALLED = 'stalled';
const HEADER_STATE_COMPLETE = 'complete';
const PERCENT_MULT = 100;
const DIM_OPACITY = 0.35;
const FULL_OPACITY = 1;
const ACTIVE_WEIGHT = 600;
const INACTIVE_WEIGHT = 400;

function pickRowBorderColor(active: boolean, done: boolean): string {
  if (done) {
    return `${TOK.green}40`;
  }
  if (active) {
    return `${TOK.sun}40`;
  }
  return TOK.line;
}

function pickRowBackground(active: boolean, done: boolean): string {
  if (done) {
    return TOK.greenPale;
  }
  if (active) {
    return TOK.sunPale;
  }
  return '#fff';
}

function pickNumBackground(active: boolean, done: boolean): string {
  if (done) {
    return TOK.green;
  }
  if (active) {
    return TOK.sun;
  }
  return TOK.cream2;
}

function pickNumBorder(active: boolean, done: boolean): string {
  if (done) {
    return TOK.green;
  }
  if (active) {
    return TOK.sun;
  }
  return TOK.line;
}

function pickCountColor(active: boolean, done: boolean): string {
  if (done) {
    return TOK.green;
  }
  if (active) {
    return TOK.sunDark;
  }
  return TOK.ink3;
}

interface HeaderDetailInput {
  canFinish: boolean;
  isStalled: boolean;
  hasAnalysisError: boolean;
  isStillSorting: boolean;
  currentPhase: number;
  realProgress: RealProgress;
}

function pickStalledDetail(translate: TFn, hasAnalysisError: boolean): string {
  if (hasAnalysisError) {
    return translate('setupWizard.learning.stalledDetailError');
  }
  return translate('setupWizard.learning.stalledDetailTimeout', { minutes: IMPORT_TIMEOUT_MINUTES });
}

function pickHeaderTitle(translate: TFn, canFinish: boolean, isStalled: boolean, currentPhase: number): string {
  if (canFinish) {
    return translate('setupWizard.learning.readyTitle');
  }
  if (isStalled) {
    return translate('setupWizard.learning.stalledTitle');
  }
  return translate(PHASE_LABEL_KEYS[Math.min(currentPhase, PHASE_LABEL_KEYS.length - 1)]);
}

function pickHeaderDetail(translate: TFn, input: HeaderDetailInput): string {
  if (input.isStalled && !input.canFinish) {
    return pickStalledDetail(translate, input.hasAnalysisError);
  }
  if (input.isStillSorting) {
    return translate('setupWizard.learning.readyDetailStillSorting');
  }
  if (input.canFinish) {
    return translate('setupWizard.learning.readyDetail');
  }
  return buildStatusDetail(translate, input.currentPhase, input.realProgress);
}

interface HeaderContent {
  title: string;
  detail: string;
  state: HeaderState;
}

/** With no mailbox the analysis can't run at all, so say that instead of "stalled" (#442). */
function pickHeaderContent(
  translate: TFn,
  view: Omit<HeaderDetailInput, 'hasAnalysisError'>,
  hasAnalysisError: boolean,
  hasNoMailbox: boolean
): HeaderContent {
  if (hasNoMailbox) {
    return {
      title: translate('setupWizard.learning.noMailboxTitle'),
      detail: translate('setupWizard.learning.noMailboxDetail'),
      state: HEADER_STATE_STALLED,
    };
  }
  return {
    title: pickHeaderTitle(translate, view.canFinish, view.isStalled, view.currentPhase),
    detail: pickHeaderDetail(translate, { ...view, hasAnalysisError }),
    state: pickHeaderState(view.canFinish, view.isStalled, view.isStillSorting),
  };
}

/**
 * With no mailbox, returns what to do once the user connects one here (recheck,
 * then re-run the analysis that couldn't start); otherwise undefined.
 */
function useConnectMailboxInstead(retryAnalysis: () => void): (() => Promise<void>) | undefined {
  const { status, recheck } = useMailboxConnection();
  const onConnected = useCallback(async () => {
    await recheck();
    retryAnalysis();
  }, [recheck, retryAnalysis]);
  return status === MAILBOX_STATUS.NONE ? onConnected : undefined;
}

/** Flips `timedOut` after `waitMs`; `restartTimeout` clears it and starts a fresh full wait (used on retry). */
function useMaxWaitTimeout(waitMs: number): { timedOut: boolean; restartTimeout: () => void } {
  const [timedOut, setTimedOut] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const timeoutId = setTimeout(() => setTimedOut(true), waitMs);
    return () => clearTimeout(timeoutId);
  }, [epoch, waitMs]);

  const restartTimeout = useCallback(() => {
    setTimedOut(false);
    setEpoch(current => current + 1);
  }, []);

  return { timedOut, restartTimeout };
}

/**
 * The analysis normally started in the background when the mailbox was
 * connected, so join it (often already finished) once, rather than restarting it.
 */
function useJoinAnalysisOnArrival(isUnderway: boolean, joinOrStartAnalysis: () => Promise<void>): void {
  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!isUnderway && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      joinOrStartAnalysis();
    }
  }, [isUnderway, joinOrStartAnalysis]);
}

export const LearningStep: React.FC<LearningStepProps> = ({ onComplete, onBack, isLoading }) => {
  const { t } = useTranslation();
  const [importProgress, setImportProgress] = useState<ImportProgress>({ prioritizedCount: 0, isReady: false });
  const { timedOut, restartTimeout } = useMaxWaitTimeout(IMPORT_TIMEOUT_MS);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadyRef = useRef(false);
  const mountedRef = useRef(true);

  const handleAnalysisComplete = useCallback(async () => undefined, []);

  const { analyzing, analyzeProgress, startAnalysis, joinOrStartAnalysis } = useAnalysisProgress(
    handleAnalysisComplete,
    { isNewUserOnboarding: true }
  );

  useJoinAnalysisOnArrival(analyzing || analyzeProgress.isComplete, joinOrStartAnalysis);

  const fetchImportProgress = useCallback(async () => {
    try {
      const response = await axios.get<ImportProgress>(`${API_URL}/onboarding/email-import-progress`);
      if (!mountedRef.current) {
        return;
      }
      setImportProgress(response.data);
      if (response.data.isReady) {
        isReadyRef.current = true;
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to fetch email import progress:', err);
    }
  }, []);

  useEffect(() => {
    fetchImportProgress();
    const poll = () => {
      pollingRef.current = setTimeout(async () => {
        await fetchImportProgress();
        if (mountedRef.current && !isReadyRef.current) {
          poll();
        }
      }, POLLING_INTERVAL_MS);
    };
    poll();
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, [fetchImportProgress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const retryAnalysis = useCallback(() => {
    restartTimeout();
    startAnalysis();
  }, [restartTimeout, startAnalysis]);

  const onMailboxConnected = useConnectMailboxInstead(retryAnalysis);
  const recategorise = useRecategorise();

  const categorisation = useCategorisationProgress(hasLearningFinished(analyzeProgress, importProgress, timedOut));
  const view = computeLearningView(analyzeProgress, importProgress, timedOut, categorisation);
  const { displayProgress, canFinish, currentPhase, realProgress } = view;
  const header = pickHeaderContent(t, view, Boolean(analyzeProgress.error), Boolean(onMailboxConnected));

  return (
    <section className="onboarding-pane" style={paneStyle}>
      <h1 className="onboarding-h1" style={h1Style}>
        {t('setupWizard.learning.title')}
      </h1>
      <p className="onboarding-lede" style={ledeStyle}>
        {t('setupWizard.learning.lede')}
      </p>

      <LearningHeader
        headerState={header.state}
        headerTitle={header.title}
        headerDetail={header.detail}
        displayProgress={displayProgress}
      />

      <LearningRows currentPhase={currentPhase} realProgress={realProgress} t={t} />

      <LearnedContextEditor isEnabled={analyzeProgress.isComplete} onCategoriesChanged={recategorise.markCategoriesChanged} />
      <CategoryCountsPanel status={recategorise.status} progress={recategorise.progress} counts={recategorise.counts} />

      <PrivacyCard t={t} />

      <StepActions
        stalled={header.state === HEADER_STATE_STALLED}
        stalledActions={{ isLoading, onBack, onRetry: retryAnalysis, onSkip: onComplete, onMailboxConnected, t }}
        primary={pickPrimaryAction({ canFinish, isLoading, onComplete, ...toResortInput(recategorise) })}
        onBack={onBack}
        t={t}
      />
    </section>
  );
};

type ResortInput = Pick<PrimaryActionInput, 'hasUnsortedCategoryChanges' | 'isRecategorising' | 'onRecategorise'>;

function toResortInput(recategorise: RecategoriseState): ResortInput {
  return {
    hasUnsortedCategoryChanges: recategorise.hasUnsortedCategoryChanges,
    isRecategorising: recategorise.status === RECATEGORISE_STATUS.RUNNING,
    onRecategorise: recategorise.start,
  };
}

interface PrimaryAction {
  labelKey: string;
  isEnabled: boolean;
  onClick: () => void;
}

interface PrimaryActionInput {
  canFinish: boolean;
  isLoading: boolean;
  /** The user changed their categories since the inbox was last sorted. */
  hasUnsortedCategoryChanges: boolean;
  isRecategorising: boolean;
  onComplete: () => void;
  onRecategorise: () => void;
}

/**
 * The primary button opens the inbox, unless the user has changed their
 * categories: then it re-sorts the inbox with them first, so it doesn't open
 * sorted by categories they just replaced.
 */
export function pickPrimaryAction(input: PrimaryActionInput): PrimaryAction {
  if (input.isLoading) {
    return { labelKey: 'common.loading', isEnabled: false, onClick: input.onComplete };
  }
  if (input.isRecategorising) {
    return { labelKey: 'setupWizard.recategorise.running', isEnabled: false, onClick: input.onRecategorise };
  }
  if (input.hasUnsortedCategoryChanges) {
    return { labelKey: 'setupWizard.recategorise.button', isEnabled: true, onClick: input.onRecategorise };
  }
  return { labelKey: 'setupWizard.learning.openInbox', isEnabled: input.canFinish, onClick: input.onComplete };
}

interface LearningActionsProps {
  primary: PrimaryAction;
  onBack: () => void;
  t: TFn;
}

const LearningActions: React.FC<LearningActionsProps> = ({ primary, onBack, t }) => (
  <div style={actionsRowStyle}>
    <button type="button" onClick={onBack} style={ghostButtonStyle}>
      ← {t('setupWizard.common.back')}
    </button>
    <div style={spacerStyle} />
    <button
      type="button"
      onClick={primary.onClick}
      disabled={!primary.isEnabled}
      style={primaryButtonStyle(primary.isEnabled)}
      data-testid="learning-primary-action"
    >
      {t(primary.labelKey)}
    </button>
  </div>
);

interface StepActionsProps {
  stalled: boolean;
  stalledActions: StalledActionsProps;
  primary: PrimaryAction;
  onBack: () => void;
  t: TFn;
}

const StepActions: React.FC<StepActionsProps> = ({ stalled, stalledActions, primary, onBack, t }) =>
  stalled ? <StalledActions {...stalledActions} /> : <LearningActions primary={primary} onBack={onBack} t={t} />;

interface StalledActionsProps {
  isLoading: boolean;
  onBack: () => void;
  onRetry: () => void;
  onSkip: () => void;
  /** Set when no mailbox is connected: retrying can't help, so offer to connect one instead. */
  onMailboxConnected?: () => void;
  t: TFn;
}

// Skipping goes straight to the inbox: categorisation keeps running server-side,
// and holding someone who just escaped a stall for another sorting wait would
// recreate the problem.
const StalledActions: React.FC<StalledActionsProps> = ({
  isLoading,
  onBack,
  onRetry,
  onSkip,
  onMailboxConnected,
  t,
}) => (
  <div style={actionsRowStyle}>
    <button type="button" onClick={onBack} style={ghostButtonStyle}>
      ← {t('setupWizard.common.back')}
    </button>
    <div style={spacerStyle} />
    {onMailboxConnected ? (
      <ConnectMailboxButton style={secondaryButtonStyle} onConnected={onMailboxConnected} />
    ) : (
      <button type="button" onClick={onRetry} disabled={isLoading} style={secondaryButtonStyle}>
        {t('setupWizard.learning.retry')}
      </button>
    )}
    <button type="button" onClick={onSkip} disabled={isLoading} style={primaryButtonStyle(!isLoading)}>
      {isLoading ? t('common.loading') : t('setupWizard.learning.skipToInbox')}
    </button>
  </div>
);

type HeaderState = typeof HEADER_STATE_WORKING | typeof HEADER_STATE_STALLED | typeof HEADER_STATE_COMPLETE;

/** Still sorting in the background keeps the spinner: the user may continue, but the work isn't done. */
function pickHeaderState(canFinish: boolean, isStalled: boolean, isStillSorting: boolean): HeaderState {
  if (canFinish) {
    return isStillSorting ? HEADER_STATE_WORKING : HEADER_STATE_COMPLETE;
  }
  return isStalled ? HEADER_STATE_STALLED : HEADER_STATE_WORKING;
}

const HeaderIndicator: React.FC<{ headerState: HeaderState }> = ({ headerState }) => {
  if (headerState === HEADER_STATE_COMPLETE) {
    return (
      <div style={completeBadgeStyle} data-testid="learning-complete" aria-hidden>
        {'✓'}
      </div>
    );
  }
  if (headerState === HEADER_STATE_STALLED) {
    return (
      <div style={stalledBadgeStyle} data-testid="learning-stalled" aria-hidden>
        {'!'}
      </div>
    );
  }
  return <div style={spinnerStyle} data-testid="learning-spinner" />;
};

interface LearningHeaderProps {
  headerState: HeaderState;
  headerTitle: string;
  headerDetail: string;
  displayProgress: number;
}

const LearningHeader: React.FC<LearningHeaderProps> = ({ headerState, headerTitle, headerDetail, displayProgress }) => (
  <div
    style={headerState === HEADER_STATE_STALLED ? stalledHeadStyle : learnHeadStyle}
    role={headerState === HEADER_STATE_STALLED ? 'alert' : undefined}
  >
    <HeaderIndicator headerState={headerState} />
    <div style={headerTextWrapStyle}>
      <div style={learnHeadTitleStyle}>{headerTitle}</div>
      <div style={learnHeadSubStyle}>{headerDetail}</div>
    </div>
    <div style={progressMeterStyle}>
      <div style={progressTrackStyle}>
        <div style={progressFillStyle(displayProgress * PERCENT_MULT)} />
      </div>
      <span style={progressPercentStyle}>{Math.round(displayProgress * PERCENT_MULT)}%</span>
    </div>
  </div>
);

interface LearningRowsProps {
  currentPhase: number;
  realProgress: RealProgress;
  t: TFn;
}

const LearningRows: React.FC<LearningRowsProps> = ({ currentPhase, realProgress, t }) => (
  <div style={learnRowsStyle}>
    {PHASE_LABEL_KEYS.map((labelKey, idx) => {
      const isActive = idx === currentPhase;
      const isDone = idx < currentPhase;
      const count = buildRowCount(t, idx, isActive || isDone, realProgress);
      return (
        <div key={labelKey} style={learnRowStyle(isActive, isDone)}>
          <span style={learnNumStyle(isActive, isDone)}>{isDone ? '✓' : idx + 1}</span>
          <span style={learnLabelStyle}>{t(labelKey)}</span>
          <span style={learnCountStyle(isActive, isDone)}>{count}</span>
        </div>
      );
    })}
  </div>
);

const PrivacyCard: React.FC<{ t: (key: string) => string }> = ({ t }) => (
  <div style={privacyStyle}>
    <div style={privacyIconStyle}>
      <LockIcon />
    </div>
    <div>
      <h4 style={privacyTitleStyle}>{t('setupWizard.learning.privacyTitle')}</h4>
      <p style={privacyBodyStyle}>
        <Trans i18nKey="setupWizard.learning.privacyBody" components={{ b: <b /> }} />
      </p>
    </div>
  </div>
);

const LockIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="22"
    height="22"
    style={lockIconStyle}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const lockIconStyle: React.CSSProperties = { color: TOK.ink3 };
const paneStyle: React.CSSProperties = { display: 'block' };
const spacerStyle: React.CSSProperties = { flex: 1 };
// Grow into the free space so a long status line wraps inside the text column;
// without a flex basis it claimed a full row and pushed the meter onto its own line.
const headerTextWrapStyle: React.CSSProperties = { flex: '1 1 220px', minWidth: 0 };

const h1Style: React.CSSProperties = {
  fontSize: '32px',
  lineHeight: 1.1,
  letterSpacing: '-0.025em',
  fontWeight: 700,
  margin: '0 0 12px',
};

const ledeStyle: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: 1.55,
  color: TOK.ink2,
  margin: '0 0 28px',
};

const learnHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '14px 16px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '12px',
  marginBottom: '20px',
  flexWrap: 'wrap',
};

const spinnerStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: `2.5px solid ${TOK.cream3}`,
  borderTopColor: TOK.sun,
  animation: 'onboardingSpin 0.9s linear infinite',
  flexShrink: 0,
};

// Static "done" indicator shown once learning completes — no animation, so the
// screen no longer looks like it is still processing.
const completeBadgeStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: TOK.green,
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  fontSize: '15px',
  fontWeight: ACTIVE_WEIGHT,
  flexShrink: 0,
};

const stalledHeadStyle: React.CSSProperties = {
  ...learnHeadStyle,
  background: TOK.sunPale,
  border: `1px solid ${TOK.sunPale2}`,
};

const stalledBadgeStyle: React.CSSProperties = {
  ...completeBadgeStyle,
  background: TOK.sunDark,
  fontFamily: TOK.fontMono,
};

const learnHeadTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: ACTIVE_WEIGHT,
  color: TOK.ink,
};

const learnHeadSubStyle: React.CSSProperties = {
  fontSize: '12.5px',
  color: TOK.ink3,
  marginTop: '2px',
};

const progressMeterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginLeft: 'auto',
  flexShrink: 0,
};

const progressTrackStyle: React.CSSProperties = {
  height: '6px',
  background: TOK.cream3,
  borderRadius: '999px',
  overflow: 'hidden',
  width: '100px',
};

const progressPercentStyle: React.CSSProperties = {
  fontFamily: TOK.fontMono,
  fontSize: '12px',
  fontWeight: ACTIVE_WEIGHT,
  color: TOK.ink2,
  minWidth: '34px',
  textAlign: 'right',
};

const progressFillStyle = (percent: number): React.CSSProperties => ({
  display: 'block',
  height: '100%',
  background: `linear-gradient(90deg, ${TOK.sunLight}, ${TOK.sun})`,
  width: `${percent}%`,
  transition: 'width 0.4s ease',
});

const learnRowsStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  marginBottom: '24px',
};

const learnRowStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '28px 1fr auto',
  gap: '12px',
  padding: '10px 14px',
  border: `1px solid ${pickRowBorderColor(active, done)}`,
  background: pickRowBackground(active, done),
  borderRadius: '10px',
  alignItems: 'center',
  fontSize: '13.5px',
  opacity: active || done ? FULL_OPACITY : DIM_OPACITY,
  transition: 'opacity .4s ease, background .3s ease, border-color .3s ease',
});

const learnNumStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  width: '22px',
  height: '22px',
  borderRadius: '999px',
  background: pickNumBackground(active, done),
  color: done || active ? '#fff' : TOK.ink3,
  border: `1px solid ${pickNumBorder(active, done)}`,
  display: 'grid',
  placeItems: 'center',
  fontSize: '11px',
  fontWeight: ACTIVE_WEIGHT,
  fontFamily: TOK.fontMono,
});

const learnLabelStyle: React.CSSProperties = {
  color: TOK.ink2,
};

const learnCountStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  fontFamily: TOK.fontMono,
  fontSize: '12px',
  color: pickCountColor(active, done),
  fontWeight: done || active ? ACTIVE_WEIGHT : INACTIVE_WEIGHT,
});

const privacyStyle: React.CSSProperties = {
  marginTop: '24px',
  display: 'grid',
  gridTemplateColumns: '28px 1fr',
  gap: '14px',
  padding: '14px 16px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '12px',
};

const privacyIconStyle: React.CSSProperties = {
  color: TOK.ink3,
};

const privacyTitleStyle: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '13px',
  fontWeight: ACTIVE_WEIGHT,
  color: TOK.ink,
};

const privacyBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '12.5px',
  lineHeight: 1.55,
  color: TOK.ink3,
};

const actionsRowStyle: React.CSSProperties = {
  marginTop: '28px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '48px',
  padding: '0 14px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: ACTIVE_WEIGHT,
  background: 'transparent',
  color: TOK.ink2,
  border: '1.5px solid transparent',
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  background: '#fff',
  border: `1.5px solid ${TOK.line2}`,
  color: TOK.ink,
};

