import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { openWaitlist } from './waitlistStore';

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
          <a className="btn btn-ghost" href="/login">
            {t('landing.v2.header.signIn')}
          </a>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.WAIT_LIST_BUTTON_CLICKED);
              openWaitlist();
            }}
          >
            {t('landing.v2.header.joinWaitlist')}
          </button>
        </div>
      </div>
    </header>
  );
};
