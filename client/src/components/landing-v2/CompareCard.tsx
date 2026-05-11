import React from 'react';
import { useTranslation } from 'react-i18next';

export const COMPARE_ROW_KEYS = ['delivery', 'urgency', 'priority', 'quietHours', 'philosophy'] as const;
type CompareRowKey = (typeof COMPARE_ROW_KEYS)[number];

interface CompareCardProps {
  variantClass: string;
  logoClass: string;
  logoLetter: string;
  productKey: 'gmail' | 'bearlymail' | 'superhuman';
  rowMarkers: Record<CompareRowKey, React.ReactNode>;
  showRecommended?: boolean;
}

export const CompareCard: React.FC<CompareCardProps> = ({
  variantClass,
  logoClass,
  logoLetter,
  productKey,
  rowMarkers,
  showRecommended,
}) => {
  const { t } = useTranslation();
  return (
    <div className={`compare-card${variantClass}`}>
      <div className="name">
        <span className={`logo ${logoClass}`}>{logoLetter}</span>
        {t(`landing.v2.compare.${productKey}.name`)}
        {showRecommended && <span className="compare-recommended">{t('landing.v2.compare.recommended')}</span>}
      </div>
      <div className="ask">{t(`landing.v2.compare.${productKey}.ask`)}</div>
      {COMPARE_ROW_KEYS.map(rowKey => (
        <div key={rowKey} className="compare-row">
          <div className="k">{t(`landing.v2.compare.rowLabels.${rowKey}`)}</div>
          <div className="v">
            {rowMarkers[rowKey]}
            {t(`landing.v2.compare.${productKey}.${rowKey}`)}
          </div>
        </div>
      ))}
      <div className="price">
        <b>{t(`landing.v2.compare.${productKey}.priceBold`)}</b>
        {t(`landing.v2.compare.${productKey}.priceRest`)}
      </div>
    </div>
  );
};
