import React from 'react';
import { useTranslation } from 'react-i18next';

export const StepSchedule: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="visual-head">
        <b>{t('landing.v2.steps.visuals.schedule.heading')}</b>
        <span className="visual-tag">{t('landing.v2.steps.visuals.schedule.tag')}</span>
      </div>
      <div className="schedule-grid">
        <div className="time">9:00</div>
        <div className="lane quiet">{t('landing.v2.steps.visuals.schedule.row1Lane')}</div>
        <div className="time">11:00</div>
        <div className="lane delivered">
          <b>{t('landing.v2.steps.visuals.schedule.row2Bold')}</b>
          {t('landing.v2.steps.visuals.schedule.row2Body')}
          <span className="pill">{t('landing.v2.steps.visuals.schedule.row2Pill')}</span>
        </div>
        <div className="time now">14:00</div>
        <div className="lane delivered">
          <b>{t('landing.v2.steps.visuals.schedule.row3Bold')}</b>
          {t('landing.v2.steps.visuals.schedule.row3Body')}
          <span className="pill">{t('landing.v2.steps.visuals.schedule.row3Pill')}</span>
        </div>
        <div className="time">17:00</div>
        <div className="lane">
          {t('landing.v2.steps.visuals.schedule.row4Body')}
          <span className="pill pill-muted">{t('landing.v2.steps.visuals.schedule.row4Pill')}</span>
        </div>
        <div className="time">19:00</div>
        <div className="lane quiet">{t('landing.v2.steps.visuals.schedule.row5Lane')}</div>
      </div>
    </>
  );
};
