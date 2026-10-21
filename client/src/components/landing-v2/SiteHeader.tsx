import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { PRICING_SECTION_ID, SIGNUP_PATH } from './constants';

const NAV_LINKS = [
  { anchor: '#how', labelKey: 'howItWorks' },
  { anchor: '#who', labelKey: 'whoItsFor' },
  { anchor: '#compare', labelKey: 'compare' },
  { anchor: '#security', labelKey: 'security' },
  { anchor: `#${PRICING_SECTION_ID}`, labelKey: 'pricing' },
  { anchor: '#faq', labelKey: 'faq' },
] as const;

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
          {NAV_LINKS.map(link => (
            <a key={link.anchor} href={link.anchor}>
              {t(`landing.v2.header.nav.${link.labelKey}`)}
            </a>
          ))}
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
