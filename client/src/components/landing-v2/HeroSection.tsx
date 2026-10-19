import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { SIGNUP_PATH } from './constants';
import { HeroVideo } from './HeroVideo';
import { LiveDemo } from './LiveDemo';

const DEFAULT_HERO_PREFIX = 'landing.v2.hero';
const HERO_BENEFIT_KEYS = ['prioritise', 'categorise', 'calm'] as const;
const CHECK_MARK = '✓';

interface HeroSectionProps {
  /** Root i18n key for hero copy (without trailing dot). Defaults to landing.v2.hero. */
  heroPrefix?: string;
  /** Root i18n key for a role-specific LiveDemo. Omit to show the product video slot. */
  demoPrefix?: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ heroPrefix = DEFAULT_HERO_PREFIX, demoPrefix }) => {
  const { t } = useTranslation();
  const localT = (suffix: string): string => t(`${heroPrefix}.${suffix}`);

  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div className="hero-grid">
          <div>
            <span className="eyebrow">
              <span className="dot" /> {localT('eyebrow')}
            </span>
            <h1 className="display">
              {localT('titlePre')}
              <br />
              <em>{localT('titleEm')}</em>
              {localT('titlePostEm')}
              <br />
              {localT('titleAfter')}
            </h1>
            <p className="lead">{localT('lead')}</p>

            <div className="hero-cta">
              <a
                className="btn btn-sun btn-lg"
                href={SIGNUP_PATH}
                onClick={() => captureEvent(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED)}
              >
                {t('landing.v2.cta.getStarted')}
              </a>
            </div>
            <ul className="hero-benefits">
              {HERO_BENEFIT_KEYS.map(benefitKey => (
                <li key={benefitKey}>
                  <span className="check" aria-hidden="true">
                    {CHECK_MARK}
                  </span>
                  {t(`${DEFAULT_HERO_PREFIX}.benefits.${benefitKey}`)}
                </li>
              ))}
            </ul>
            <p className="hero-built-for">
              <span className="built-for-badge">{t(`${DEFAULT_HERO_PREFIX}.adhdBadge`)}</span>
              {localT('builtFor')}
            </p>
          </div>

          {demoPrefix ? <LiveDemo i18nPrefix={demoPrefix} /> : <HeroVideo />}
        </div>
      </div>
    </section>
  );
};
