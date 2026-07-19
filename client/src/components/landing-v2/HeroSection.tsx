/* eslint-disable i18next/no-literal-string */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { LiveDemo } from './LiveDemo';
import { LiveDemoRich } from './LiveDemoRich';
import { openWaitlist } from './waitlistStore';

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
  const [email, setEmail] = useState('');
  const localT = (suffix: string): string => t(`${heroPrefix}.${suffix}`);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    captureEvent(ANALYTICS_EVENTS.WAIT_LIST_BUTTON_CLICKED);
    openWaitlist(email);
  };

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

            <form className="hero-form" onSubmit={handleSubmit}>
              <div className="float-field">
                <input
                  id="hero-email"
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
                <label className="float-label" htmlFor="hero-email">
                  {localT('emailLabel')}
                </label>
              </div>
              <button className="btn btn-sun" type="submit">
                {localT('submit')}
              </button>
            </form>
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
