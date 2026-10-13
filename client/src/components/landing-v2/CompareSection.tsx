import React from 'react';
import { useTranslation } from 'react-i18next';

import { CompareCard } from './CompareCard';

const NO_MARK = <span className="x">× </span>;
const YES_MARK = <span className="ck">✓ </span>;

const GMAIL_MARKERS = {
  priority: NO_MARK,
  categories: NO_MARK,
  delivery: NO_MARK,
  ai: null,
  providers: null,
};

const BEARLY_MARKERS = {
  priority: YES_MARK,
  categories: YES_MARK,
  delivery: YES_MARK,
  ai: YES_MARK,
  providers: YES_MARK,
};

const SUPERHUMAN_MARKERS = {
  priority: NO_MARK,
  categories: NO_MARK,
  delivery: NO_MARK,
  ai: null,
  providers: null,
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
          <p className="section-sub">{t('landing.v2.compare.sub')}</p>
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

        <aside className="compare-note">
          <b>{t('landing.v2.compare.gemini.title')}</b>
          <p>{t('landing.v2.compare.gemini.body')}</p>
        </aside>
      </div>
    </section>
  );
};
