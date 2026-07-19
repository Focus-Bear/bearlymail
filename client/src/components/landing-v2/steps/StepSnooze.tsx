import React from 'react';
import { useTranslation } from 'react-i18next';

const SNOOZE_SUGGESTIONS = [
  { key: 'twoHours', hi: true },
  { key: 'tomorrow', hi: true },
  { key: 'thisFri', hi: false },
  { key: 'afterStandup', hi: false },
  { key: 'mondayMorning', hi: false },
  { key: 'inThreeWeeks', hi: false },
  { key: 'nextQuiet', hi: false },
] as const;

export const StepSnooze: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="visual-head">
        <b>{t('landing.v2.steps.visuals.snooze.heading')}</b>
        <span className="visual-tag">{t('landing.v2.steps.visuals.snooze.tag')}</span>
      </div>
      <div className="snooze-input">
        <span className="label">{t('landing.v2.steps.visuals.snooze.inputLabel')}</span>
        <input defaultValue={t('landing.v2.steps.visuals.snooze.inputValue')} />
        <span className="key">↵</span>
      </div>
      <div className="snooze-try">{t('landing.v2.steps.visuals.snooze.tryAny')}</div>
      <div className="snooze-suggest">
        {SNOOZE_SUGGESTIONS.map(suggestion => (
          <span key={suggestion.key} className={suggestion.hi ? 'hi' : ''}>
            {t(`landing.v2.steps.visuals.snooze.suggestions.${suggestion.key}`)}
          </span>
        ))}
      </div>
      <div className="snooze-footer">
        <span className="snooze-footer-key">↵</span>
        {t('landing.v2.steps.visuals.snooze.footer')}
      </div>
    </>
  );
};
