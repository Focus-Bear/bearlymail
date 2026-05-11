/* eslint-disable i18next/no-literal-string */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { LiveDemo } from './LiveDemo';
import { openWaitlist } from './waitlistStore';

export const HeroSection: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');

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
              <span className="dot" /> {t('landing.v2.hero.eyebrow')}
            </span>
            <h1 className="display">
              {t('landing.v2.hero.titlePre')}
              <br />
              <em>{t('landing.v2.hero.titleEm')}</em>
              {t('landing.v2.hero.titlePostEm')}
              <br />
              {t('landing.v2.hero.titleAfter')}
            </h1>
            <p className="lead">{t('landing.v2.hero.lead')}</p>

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
                  {t('landing.v2.hero.emailLabel')}
                </label>
              </div>
              <button className="btn btn-sun" type="submit">
                {t('landing.v2.hero.submit')}
              </button>
            </form>
            <div className="hero-meta">
              <span className="pill">
                <span className="check">✓</span> {t('landing.v2.hero.benefits.noSpam')}
              </span>
              <span className="pill">
                <span className="check">✓</span> {t('landing.v2.hero.benefits.followUp')}
              </span>
              <span className="pill">
                <span className="check">✓</span> {t('landing.v2.hero.benefits.unsubscribe')}
              </span>
            </div>
            <div className="hero-meta hero-built-for">
              <div className="avatars" aria-hidden="true">
                <span>EM</span>
                <span>RP</span>
                <span>KL</span>
                <span>AT</span>
              </div>
              <span className="built-for-text">{t('landing.v2.hero.builtFor')}</span>
            </div>
          </div>

          <LiveDemo />
        </div>
      </div>
    </section>
  );
};
