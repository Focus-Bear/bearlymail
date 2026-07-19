import React from 'react';
import { useTranslation } from 'react-i18next';

const RANKED_ROWS = [
  { width: 91, score: '91 / 100', high: true },
  { width: 78, score: '78 / 100', high: true },
  { width: 52, score: '52 / 100', high: false },
  { width: 33, score: '33 / 100', high: false },
  { width: 14, score: '14 / 100', high: false },
] as const;

export const StepRanked: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="visual-head">
        <b>{t('landing.v2.steps.visuals.ranked.heading')}</b>
        <span className="visual-tag">{t('landing.v2.steps.visuals.ranked.tag')}</span>
      </div>
      <div className="score-list">
        {RANKED_ROWS.map((row, index) => {
          const labelKey = `landing.v2.steps.visuals.ranked.row${index + 1}Label`;
          const smallKey = `landing.v2.steps.visuals.ranked.row${index + 1}Small`;
          return (
            <div key={row.score} className={`score-row${row.high ? ' high' : ''}`}>
              <div className="label">
                {t(labelKey)}
                <small>{t(smallKey)}</small>
              </div>
              <div className="meter">
                <i style={{ width: `${row.width}%` }} />
              </div>
              <div className="score">{row.score}</div>
            </div>
          );
        })}
      </div>
    </>
  );
};
