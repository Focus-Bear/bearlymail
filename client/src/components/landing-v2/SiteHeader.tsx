import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { SIGNUP_PATH } from './constants';

export const SiteHeader: React.FC = () => {
  const { t } = useTranslation();
  return (
    <header className="site">
      <div className="wrap row">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <img src="/landing/bearlymail-mark.svg" alt="" />
          </span>
          <span>{t('landing.v2.header.brand')}</span>
        </a>
        <nav className="nav">
          <a href="#how">{t('landing.v2.header.nav.howItWorks')}</a>
          <a href="#compare">{t('landing.v2.header.nav.compare')}</a>
          <a href="#story">{t('landing.v2.header.nav.story')}</a>
          <a href="#faq">{t('landing.v2.header.nav.faq')}</a>
        </nav>
        <div className="nav-cta">
          <a className="btn btn-ghost" href={SIGNUP_PATH}>
            {t('landing.v2.header.signIn')}
          </a>
          <a
            className="btn btn-outline"
            href={SIGNUP_PATH}
            onClick={() => captureEvent(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED)}
          >
            {t('landing.v2.cta.getStarted')}
          </a>
        </div>
      </div>
    </header>
  );
};
