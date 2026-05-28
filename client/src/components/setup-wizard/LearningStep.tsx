import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';
import { MS_PER_SECOND, POLLING_INTERVAL_MS, SECONDS_PER_MINUTE } from 'constants/numbers';
import { useAnalysisProgress } from 'hooks/settings/useAnalysisProgress';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

interface LearningStepProps {
  onComplete: () => void;
  onBack: () => void;
  isLoading: boolean;
}

interface ImportProgress {
  prioritizedCount: number;
  isReady: boolean;
}

const IMPORT_TARGET = 100;
const IMPORT_TIMEOUT_MINUTES = 5;
const IMPORT_TIMEOUT_MS = IMPORT_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const STAGE_COUNT = 5;
const ANALYSIS_WEIGHT = 0.7;
const IMPORT_WEIGHT = 0.3;
const PROGRESS_CAP_BEFORE_READY = 0.99;
const PROGRESS_MAX = 1;
const PERCENT_MULT = 100;
const DIM_OPACITY = 0.35;
const FULL_OPACITY = 1;
const ACTIVE_WEIGHT = 600;
const INACTIVE_WEIGHT = 400;
const HISTORY_TOTAL_DAYS = 90;
const FAST_REPLY_SENDERS = 412;
const TOPIC_CLUSTERS = 18;
const NEWSLETTER_SENDERS = 247;
const URGENCY_BASE_PCT = 50;
const URGENCY_RANGE_PCT = 44;

const ROW_HISTORY = 'history';
const ROW_FAST_REPLY = 'fastReply';
const ROW_TOPICS = 'topics';
const ROW_NEWSLETTERS = 'newsletters';
const ROW_URGENCY = 'urgency';

interface LearnRow {
  rowKey: string;
  labelKey: string;
  countFormatter: (progress: number) => string;
}

const LEARN_ROWS: LearnRow[] = [
  {
    rowKey: ROW_HISTORY,
    labelKey: 'setupWizard.learning.row1',
    countFormatter: progress => `${Math.round(progress * HISTORY_TOTAL_DAYS)} / ${HISTORY_TOTAL_DAYS} days`,
  },
  {
    rowKey: ROW_FAST_REPLY,
    labelKey: 'setupWizard.learning.row2',
    countFormatter: progress => `${Math.round(progress * FAST_REPLY_SENDERS)} / ${FAST_REPLY_SENDERS} senders`,
  },
  {
    rowKey: ROW_TOPICS,
    labelKey: 'setupWizard.learning.row3',
    countFormatter: progress => `${Math.round(progress * TOPIC_CLUSTERS)} topics`,
  },
  {
    rowKey: ROW_NEWSLETTERS,
    labelKey: 'setupWizard.learning.row4',
    countFormatter: progress => `${Math.round(progress * NEWSLETTER_SENDERS)} senders`,
  },
  {
    rowKey: ROW_URGENCY,
    labelKey: 'setupWizard.learning.row5',
    countFormatter: progress => `${URGENCY_BASE_PCT + Math.round(progress * URGENCY_RANGE_PCT)}%`,
  },
];

const STAGE_TITLE_KEYS = [
  'setupWizard.learning.stage1Title',
  'setupWizard.learning.stage2Title',
  'setupWizard.learning.stage3Title',
  'setupWizard.learning.stage4Title',
  'setupWizard.learning.stage5Title',
];

const STAGE_DETAIL_KEYS = [
  'setupWizard.learning.stage1Detail',
  'setupWizard.learning.stage2Detail',
  'setupWizard.learning.stage3Detail',
  'setupWizard.learning.stage4Detail',
  'setupWizard.learning.stage5Detail',
];

function pickRowProgress(idx: number, activeStageIdx: number, displayProgress: number): number {
  if (idx < activeStageIdx) {
    return PROGRESS_MAX;
  }
  if (idx === activeStageIdx) {
    return Math.min(PROGRESS_MAX, displayProgress * STAGE_COUNT - idx);
  }
  return 0;
}

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

export const LearningStep: React.FC<LearningStepProps> = ({ onComplete, onBack, isLoading }) => {
  const { t } = useTranslation();
  const [importProgress, setImportProgress] = useState<ImportProgress>({ prioritizedCount: 0, isReady: false });
  const [timedOut, setTimedOut] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedAnalysisRef = useRef(false);
  const isReadyRef = useRef(false);
  const mountedRef = useRef(true);

  const handleAnalysisComplete = useCallback(async () => undefined, []);

  const { analyzing, analyzeProgress, startAnalysis } = useAnalysisProgress(handleAnalysisComplete, {
    isNewUserOnboarding: true,
  });

  useEffect(() => {
    if (!analyzing && !analyzeProgress.isComplete && !hasStartedAnalysisRef.current) {
      hasStartedAnalysisRef.current = true;
      startAnalysis();
    }
  }, [analyzing, analyzeProgress.isComplete, startAnalysis]);

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
    const timeoutId = setTimeout(() => {
      if (mountedRef.current) {
        setTimedOut(true);
      }
    }, IMPORT_TIMEOUT_MS);
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const analysisProgress = analyzeProgress.progress
    ? Math.min(PROGRESS_MAX, analyzeProgress.progress.current / Math.max(1, analyzeProgress.progress.total))
    : 0;
  const importProgressPct = Math.min(PROGRESS_MAX, importProgress.prioritizedCount / IMPORT_TARGET);
  const overallProgress = Math.min(PROGRESS_MAX, ANALYSIS_WEIGHT * analysisProgress + IMPORT_WEIGHT * importProgressPct);
  const displayProgress = importProgress.isReady ? PROGRESS_MAX : Math.min(PROGRESS_CAP_BEFORE_READY, overallProgress);
  const activeStageIdx = Math.min(STAGE_COUNT - 1, Math.floor(displayProgress * STAGE_COUNT));
  const isFullyComplete = importProgress.isReady && analyzeProgress.isComplete;
  const canFinish = isFullyComplete || timedOut;

  const headerTitle = isFullyComplete
    ? t('setupWizard.learning.readyTitle')
    : t(STAGE_TITLE_KEYS[activeStageIdx]);
  const headerDetail = isFullyComplete
    ? t('setupWizard.learning.readyDetail')
    : t(STAGE_DETAIL_KEYS[activeStageIdx]);

  return (
    <section className="onboarding-pane" style={paneStyle}>
      <h1 className="onboarding-h1" style={h1Style}>
        {t('setupWizard.learning.title')}
      </h1>
      <p className="onboarding-lede" style={ledeStyle}>
        {t('setupWizard.learning.lede')}
      </p>

      <LearningHeader
        canFinish={canFinish}
        headerTitle={headerTitle}
        headerDetail={headerDetail}
        displayProgress={displayProgress}
      />

      <LearningRows activeStageIdx={activeStageIdx} canFinish={canFinish} displayProgress={displayProgress} t={t} />

      <PrivacyCard t={t} />

      <div style={actionsRowStyle}>
        <button type="button" onClick={onBack} style={ghostButtonStyle}>
          ← {t('setupWizard.common.back')}
        </button>
        <div style={spacerStyle} />
        <button
          onClick={onComplete}
          disabled={!canFinish || isLoading}
          style={primaryButtonStyle(canFinish && !isLoading)}
        >
          {isLoading ? t('common.loading') : t('setupWizard.learning.openInbox')}
        </button>
      </div>
    </section>
  );
};

interface LearningHeaderProps {
  canFinish: boolean;
  headerTitle: string;
  headerDetail: string;
  displayProgress: number;
}

const LearningHeader: React.FC<LearningHeaderProps> = ({ canFinish, headerTitle, headerDetail, displayProgress }) => (
  <div style={learnHeadStyle}>
    <div style={spinnerStyle(canFinish)} />
    <div style={headerTextWrapStyle}>
      <div style={learnHeadTitleStyle}>{headerTitle}</div>
      <div style={learnHeadSubStyle}>{headerDetail}</div>
    </div>
    <div style={progressTrackStyle}>
      <div style={progressFillStyle(displayProgress * PERCENT_MULT)} />
    </div>
  </div>
);

interface LearningRowsProps {
  activeStageIdx: number;
  canFinish: boolean;
  displayProgress: number;
  t: (key: string) => string;
}

const LearningRows: React.FC<LearningRowsProps> = ({ activeStageIdx, canFinish, displayProgress, t }) => (
  <div style={learnRowsStyle}>
    {LEARN_ROWS.map((row, idx) => {
      const isActive = idx === activeStageIdx && !canFinish;
      const isDone = idx < activeStageIdx || canFinish;
      const rowProgress = pickRowProgress(idx, activeStageIdx, displayProgress);
      return (
        <div key={row.rowKey} style={learnRowStyle(isActive, isDone)}>
          <span style={learnNumStyle(isActive, isDone)}>{isDone ? '✓' : idx + 1}</span>
          <span style={learnLabelStyle}>{t(row.labelKey)}</span>
          <span style={learnCountStyle(isActive, isDone)}>{row.countFormatter(rowProgress)}</span>
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
        {t('setupWizard.learning.privacyBodyPart1')} <b>{t('setupWizard.learning.privacyOpenAi')}</b>{' '}
        {t('setupWizard.learning.privacyAnd')} <b>{t('setupWizard.learning.privacyGemini')}</b>
        {t('setupWizard.learning.privacyBodyPart2')}{' '}
        <a href="/settings" style={privacyLinkStyle}>
          {t('setupWizard.learning.privacyExport')}
        </a>{' '}
        {t('setupWizard.learning.privacyOr')}{' '}
        <a href="/settings" style={privacyLinkStyle}>
          {t('setupWizard.learning.privacyDelete')}
        </a>{' '}
        {t('setupWizard.learning.privacyBodyPart3')}
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
const headerTextWrapStyle: React.CSSProperties = { minWidth: 0 };

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

const spinnerStyle = (done: boolean): React.CSSProperties => ({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: `2.5px solid ${TOK.cream3}`,
  borderTopColor: done ? TOK.green : TOK.sun,
  animation: 'onboardingSpin 0.9s linear infinite',
  flexShrink: 0,
  animationDuration: done ? '2.4s' : '0.9s',
});

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

const progressTrackStyle: React.CSSProperties = {
  height: '6px',
  background: TOK.cream3,
  borderRadius: '999px',
  overflow: 'hidden',
  marginLeft: 'auto',
  width: '100px',
  flexShrink: 0,
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

const privacyLinkStyle: React.CSSProperties = {
  color: TOK.ink2,
  fontWeight: ACTIVE_WEIGHT,
  textDecoration: 'underline',
  textDecorationColor: TOK.line2,
  textUnderlineOffset: '2px',
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

const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '48px',
  padding: '0 22px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: ACTIVE_WEIGHT,
  border: `1.5px solid ${enabled ? TOK.sun : TOK.sunPale2}`,
  background: enabled ? TOK.sun : TOK.sunPale2,
  color: '#fff',
  cursor: enabled ? 'pointer' : 'not-allowed',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.12)',
});
