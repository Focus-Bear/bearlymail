import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

const FOCUS_BEAR_URL = 'https://focusbear.io';

export const FaqItem: React.FC<{ faqKey: string }> = ({ faqKey }) => {
  const { t } = useTranslation();
  const question = t(`landing.v2.faq.items.${faqKey}.q`);
  return (
    <details className="faq-item">
      <summary>{question}</summary>
      <p>
        <Trans
          i18nKey={`landing.v2.faq.items.${faqKey}.a`}
          components={{
            focusBear: <a href={FOCUS_BEAR_URL} className="focus-bear-link" />,
          }}
        />
      </p>
    </details>
  );
};
