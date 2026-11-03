import React from 'react';
import { useTranslation } from 'react-i18next';

import { ONBOARDING_TOKENS as TOK } from 'components/setup-wizard/onboarding-tokens';

import { type CategoryCount, RECATEGORISE_STATUS, type RecategoriseJobProgress, type RecategoriseStatus } from './recategorise';

const PERCENT_MULT = 100;
const ACTIVE_WEIGHT = 600;
/** React key for the "Other" row, whose categoryId is null. */
const OTHER_KEY = 'other';

interface CategoryCountsPanelProps {
  status: RecategoriseStatus;
  progress: RecategoriseJobProgress | null;
  counts: CategoryCount[];
}

/** Live "where your emails are going" view while the onboarding re-sort runs, and its result. */
export const CategoryCountsPanel: React.FC<CategoryCountsPanelProps> = ({ status, progress, counts }) => {
  const { t } = useTranslation();
  if (status === RECATEGORISE_STATUS.IDLE) {
    return null;
  }
  if (status === RECATEGORISE_STATUS.ERROR) {
    return (
      <p role="alert" style={errorStyle}>
        {t('setupWizard.recategorise.error')}
      </p>
    );
  }
  const isRunning = status === RECATEGORISE_STATUS.RUNNING;
  const largest = Math.max(1, ...counts.map(entry => entry.count));

  return (
    <section style={panelStyle} aria-live="polite" data-testid="recategorise-panel">
      <div style={headerStyle}>
        <h3 style={titleStyle}>
          {isRunning ? t('setupWizard.recategorise.runningTitle') : t('setupWizard.recategorise.doneTitle')}
        </h3>
        {isRunning && progress && (
          <span style={progressTextStyle}>
            {t('setupWizard.recategorise.progress', {
              done: progress.completed + progress.failed,
              total: progress.total,
            })}
          </span>
        )}
      </div>
      <ul style={listStyle}>
        {counts.map(entry => (
          <li key={entry.categoryId ?? OTHER_KEY} style={rowStyle}>
            <span style={nameStyle}>{entry.name ?? t('setupWizard.recategorise.other')}</span>
            <span style={trackStyle}>
              <span style={fillStyle((entry.count / largest) * PERCENT_MULT)} />
            </span>
            <span style={countStyle}>{t('setupWizard.recategorise.emailCount', { count: entry.count })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};


const panelStyle: React.CSSProperties = {
  marginTop: '20px',
  padding: '14px 16px',
  background: '#fff',
  border: `1px solid ${TOK.sunPale2}`,
  borderRadius: '12px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '10px',
  flexWrap: 'wrap',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  fontWeight: ACTIVE_WEIGHT,
  color: TOK.ink,
};

const progressTextStyle: React.CSSProperties = {
  fontFamily: TOK.fontMono,
  fontSize: '12px',
  color: TOK.sunDark,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '6px',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(60px, 1fr) 84px',
  alignItems: 'center',
  gap: '12px',
  fontSize: '13px',
};

const nameStyle: React.CSSProperties = {
  color: TOK.ink2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const trackStyle: React.CSSProperties = {
  height: '6px',
  background: TOK.cream3,
  borderRadius: '999px',
  overflow: 'hidden',
};

const fillStyle = (percent: number): React.CSSProperties => ({
  display: 'block',
  height: '100%',
  width: `${percent}%`,
  background: `linear-gradient(90deg, ${TOK.sunLight}, ${TOK.sun})`,
  transition: 'width 0.4s ease',
});

const countStyle: React.CSSProperties = {
  fontFamily: TOK.fontMono,
  fontSize: '12px',
  color: TOK.ink3,
  textAlign: 'right',
};

const errorStyle: React.CSSProperties = {
  marginTop: '20px',
  fontSize: '13px',
  color: TOK.sunDark,
};
