import React from 'react';
import { useTranslation } from 'react-i18next';

import { CompareCard } from './CompareCard';

const NO_MARK = <span className="x">× </span>;
const YES_MARK = <span className="ck">✓ </span>;

const GMAIL_MARKERS = {
  delivery: null,
  urgency: NO_MARK,
  priority: NO_MARK,
  quietHours: NO_MARK,
  philosophy: null,
};

const BEARLY_MARKERS = {
  delivery: null,
  urgency: YES_MARK,
  priority: YES_MARK,
  quietHours: YES_MARK,
  philosophy: null,
};

const SUPERHUMAN_MARKERS = {
  delivery: null,
  urgency: NO_MARK,
  priority: NO_MARK,
  quietHours: NO_MARK,
  philosophy: null,
};

export const CompareSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="compare" className="section-band">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t('landing.v2.compare.kicker')}</span>
          <h2 className="section-title">
            {t('landing.v2.compare.titlePre')}
            <em>{t('landing.v2.compare.titleEm')}</em>
          </h2>
          <p className="section-sub">
            {t('landing.v2.compare.sub1')}
            <i>{t('landing.v2.compare.sub1Em')}</i>
            {t('landing.v2.compare.sub2')}
            <i>{t('landing.v2.compare.sub2Em')}</i>
          </p>
        </div>

        <div className="compare-stage">
          <CompareCard
            variantClass=""
            logoClass="logo-gm"
            logoLetter="G"
            productKey="gmail"
            rowMarkers={GMAIL_MARKERS}
          />
          <CompareCard
            variantClass=" us"
            logoClass="logo-bm"
            logoLetter="B"
            productKey="bearlymail"
            showRecommended
            rowMarkers={BEARLY_MARKERS}
          />
          <CompareCard
            variantClass=""
            logoClass="logo-sh"
            logoLetter="S"
            productKey="superhuman"
            rowMarkers={SUPERHUMAN_MARKERS}
          />
        </div>
      </div>
    </section>
  );
};
