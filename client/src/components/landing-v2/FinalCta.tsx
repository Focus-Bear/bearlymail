import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { openWaitlist } from './waitlistStore';

export const FinalCta: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    captureEvent(ANALYTICS_EVENTS.WAIT_LIST_BUTTON_CLICKED);
    openWaitlist(email);
  };

  return (
    <section className="cta-final">
      <div className="wrap">
        <div className="inner">
          <h2>
            {t('landing.v2.ctaFinal.titlePre')}
            <em>{t('landing.v2.ctaFinal.titleEm')}</em>
          </h2>
          <p>{t('landing.v2.ctaFinal.body')}</p>
          <form className="form" onSubmit={handleSubmit}>
            <div className="float-field float-field-dark">
              <input
                id="cta-email"
                type="email"
                required
                placeholder=" "
                value={email}
                onChange={event => setEmail(event.target.value)}
                onBlur={() => {
                  if (email) {
                    captureEvent(ANALYTICS_EVENTS.WAIT_LIST_EMAIL_ENTERED);
                  }
                }}
              />
              <label className="float-label" htmlFor="cta-email">
                {t('landing.v2.ctaFinal.emailLabel')}
              </label>
            </div>
            <button className="btn btn-sun" type="submit">
              {t('landing.v2.ctaFinal.submit')}
            </button>
          </form>
          <div className="meta">
            {t('landing.v2.ctaFinal.metaPre')}
            <b>{t('landing.v2.ctaFinal.metaBold')}</b>
            {t('landing.v2.ctaFinal.metaRest')}
          </div>
        </div>
      </div>
    </section>
  );
};
