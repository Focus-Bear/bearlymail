import React from 'react';
import { useTranslation } from 'react-i18next';

export const StepUrgency: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="visual-head">
        <b>{t('landing.v2.steps.visuals.urgency.heading')}</b>
        <span className="visual-tag">{t('landing.v2.steps.visuals.urgency.tag')}</span>
      </div>
      <div className="urgent-flow">
        <div className="urgent-row match">
          <span className="ic">⚡</span>
          <div>{t('landing.v2.steps.visuals.urgency.row1')}</div>
          <div className="out">{t('landing.v2.steps.visuals.urgency.row1Out')}</div>
        </div>
        <div className="urgent-row match">
          <span className="ic">CE</span>
          <div>{t('landing.v2.steps.visuals.urgency.row2')}</div>
          <div className="out">{t('landing.v2.steps.visuals.urgency.row2Out')}</div>
        </div>
        <div className="urgent-row">
          <span className="ic">N</span>
          <div>{t('landing.v2.steps.visuals.urgency.row3')}</div>
          <div className="out">{t('landing.v2.steps.visuals.urgency.row3Out')}</div>
        </div>
        <div className="urgent-row">
          <span className="ic">$</span>
          <div>{t('landing.v2.steps.visuals.urgency.row4')}</div>
          <div className="out">{t('landing.v2.steps.visuals.urgency.row4Out')}</div>
        </div>
      </div>
      <div className="visual-footer">
        <b className="visual-footer-bold">{t('landing.v2.steps.visuals.urgency.footerBold')}</b>
        {t('landing.v2.steps.visuals.urgency.footerRest')}
      </div>
    </>
  );
};
