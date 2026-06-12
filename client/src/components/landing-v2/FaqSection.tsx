import React from 'react';
import { useTranslation } from 'react-i18next';

import { FaqItem } from './FaqItem';

const FAQ_KEYS = [
  'timeSensitive',
  'priorityScore',
  'lowScore',
  'vip',
  'manualTriage',
  'colleagues',
  'providers',
  'calendar',
  'peek',
  'ai',
  'gmailImportant',
  'price',
  'cancel',
] as const;

export const FaqSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="faq" className="section-band">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t('landing.v2.faq.kicker')}</span>
          <h2 className="section-title">{t('landing.v2.faq.title')}</h2>
        </div>
        <div className="faq-grid">
          {FAQ_KEYS.map(key => (
            <FaqItem key={key} faqKey={key} />
          ))}
        </div>
      </div>
    </section>
  );
};
