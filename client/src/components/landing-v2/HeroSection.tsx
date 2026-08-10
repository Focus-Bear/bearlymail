/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { SIGNUP_PATH } from './constants';
import { LiveDemo } from './LiveDemo';
import { LiveDemoRich } from './LiveDemoRich';

const DEFAULT_HERO_PREFIX = 'landing.v2.hero';
const DEFAULT_DEMO_PREFIX = 'landing.v2.demo';

interface HeroSectionProps {
  /** Root i18n key for hero copy (without trailing dot). Defaults to landing.v2.hero. */
  heroPrefix?: string;
  /** Root i18n key for the LiveDemo's strings. Defaults to landing.v2.demo. */
  demoPrefix?: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  heroPrefix = DEFAULT_HERO_PREFIX,
  demoPrefix = DEFAULT_DEMO_PREFIX,
}) => {
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

            <div className="hero-form">
              <a
                className="btn btn-sun btn-lg"
                href={SIGNUP_PATH}
                onClick={() => captureEvent(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED)}
              >
                {t('landing.v2.cta.getStarted')}
              </a>
            </div>
            <div className="hero-meta">
              <span className="pill">
                <span className="check">✓</span> {localT('benefits.noSpam')}
              </span>
              <span className="pill">
                <span className="check">✓</span> {localT('benefits.followUp')}
              </span>
              <span className="pill">
                <span className="check">✓</span> {localT('benefits.unsubscribe')}
              </span>
            </div>
            <div className="hero-meta hero-built-for">
              <div className="avatars" aria-hidden="true">
                <span>EM</span>
                <span>RP</span>
                <span>KL</span>
                <span>AT</span>
              </div>
              <span className="built-for-text">{localT('builtFor')}</span>
            </div>
          </div>

          {demoPrefix === DEFAULT_DEMO_PREFIX ? (
            <LiveDemoRich />
          ) : (
            <LiveDemo i18nPrefix={demoPrefix} />
          )}
        </div>
      </div>
    </section>
  );
};
