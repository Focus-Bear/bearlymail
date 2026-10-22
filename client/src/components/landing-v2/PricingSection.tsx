import React from 'react';
import { useTranslation } from 'react-i18next';

import { PRICING_SECTION_ID, PRICING_TIERS } from './constants';
import { PricingTierCard } from './PricingTierCard';

const PRICING_PREFIX = 'landing.v2.pricing';

export const PricingSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id={PRICING_SECTION_ID}>
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t(`${PRICING_PREFIX}.kicker`)}</span>
          <h2 className="section-title">
            {t(`${PRICING_PREFIX}.titlePre`)}
            <em>{t(`${PRICING_PREFIX}.titleEm`)}</em>
          </h2>
          <p className="section-sub">{t(`${PRICING_PREFIX}.sub`)}</p>
        </div>
        <div className="pricing-grid">
          {PRICING_TIERS.map(tier => (
            <PricingTierCard key={tier.id} tier={tier} />
          ))}
        </div>
        <p className="pricing-note">{t(`${PRICING_PREFIX}.note`)}</p>
      </div>
    </section>
  );
};
