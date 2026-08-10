import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { SIGNUP_PATH } from './constants';

export const FinalCta: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="cta-final">
      <div className="wrap">
        <div className="inner">
          <h2>
            {t('landing.v2.ctaFinal.titlePre')}
            <em>{t('landing.v2.ctaFinal.titleEm')}</em>
          </h2>
          <p>{t('landing.v2.ctaFinal.body')}</p>
          <div className="form">
            <a
              className="btn btn-sun btn-lg"
              href={SIGNUP_PATH}
              onClick={() => captureEvent(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED)}
            >
              {t('landing.v2.cta.getStarted')}
            </a>
          </div>
          <div className="meta">{t('landing.v2.ctaFinal.meta')}</div>
        </div>
      </div>
    </section>
  );
};
