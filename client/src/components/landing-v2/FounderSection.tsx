import React from 'react';
import { useTranslation } from 'react-i18next';

const FOUNDER_PARAGRAPHS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const;

export const FounderSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="story" className="founder-band">
      <div className="wrap">
        <div className="founder">
          <div className="portrait" aria-label={t('landing.v2.founder.name')}>
            <img src="/landing/founder.png" alt={t('landing.v2.founder.name')} />
          </div>
          <div>
            <span className="kicker founder-kicker">{t('landing.v2.founder.kicker')}</span>
            <blockquote>
              {t('landing.v2.founder.quotePre')}
              <span className="accent">{t('landing.v2.founder.quoteEm')}</span>
              {t('landing.v2.founder.quoteAfter')}
            </blockquote>
            <div className="who">
              <b>{t('landing.v2.founder.name')}</b>
              <span className="sep" />
              <span>{t('landing.v2.founder.role')}</span>
              <span className="sep" />
              <span>{t('landing.v2.founder.previously')}</span>
            </div>

            <details>
              <summary>{t('landing.v2.founder.readStory')}</summary>
              {FOUNDER_PARAGRAPHS.map(paragraphKey => (
                <p key={paragraphKey}>{t(`landing.v2.founder.paragraphs.${paragraphKey}`)}</p>
              ))}
            </details>
          </div>
        </div>
      </div>
    </section>
  );
};
