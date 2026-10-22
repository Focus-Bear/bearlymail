import React from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { PricingTier, SIGNUP_PATH } from './constants';

const PRICING_PREFIX = 'landing.v2.pricing';
const PRICING_CTA_SOURCE = 'pricing';
const CHECK_MARK = '✓';

interface PricingTierCardProps {
  tier: PricingTier;
}

export const PricingTierCard: React.FC<PricingTierCardProps> = ({ tier }) => {
  const { t } = useTranslation();
  const tierPrefix = `${PRICING_PREFIX}.tiers.${tier.id}`;
  const recommendedClass = tier.isRecommended ? ' recommended' : '';
  const ctaClass = tier.isRecommended ? 'btn btn-sun btn-lg' : 'btn btn-outline btn-lg';

  return (
    <article className={`pricing-card${recommendedClass}`} data-testid={`pricing-tier-${tier.id}`}>
      <h3 className="tier-name">
        {t(`${tierPrefix}.name`)}
        {tier.isRecommended && <span className="compare-recommended">{t(`${PRICING_PREFIX}.recommended`)}</span>}
      </h3>
      <p className="tier-tagline">{t(`${tierPrefix}.tagline`)}</p>
      <p className="tier-price">
        <b>{t(`${PRICING_PREFIX}.price`, { price: tier.monthlyPriceUsd })}</b>
        <span>{t(`${PRICING_PREFIX}.perMonth`)}</span>
      </p>
      <p className="tier-allowance">{t(`${PRICING_PREFIX}.allowance`, { emails: tier.emailsPerMonth })}</p>
      <ul className="tier-features">
        {tier.featureKeys.map(featureKey => (
          <li key={featureKey}>
            <span className="ck" aria-hidden="true">
              {CHECK_MARK}
            </span>
            <span>{t(`${tierPrefix}.features.${featureKey}`)}</span>
          </li>
        ))}
      </ul>
      <a
        className={ctaClass}
        href={SIGNUP_PATH}
        onClick={() =>
          captureEvent(ANALYTICS_EVENTS.LANDING_SIGN_UP_CLICKED, { source: PRICING_CTA_SOURCE, tier: tier.id })
        }
      >
        {t(`${PRICING_PREFIX}.cta`)}
      </a>
    </article>
  );
};
