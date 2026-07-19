import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiInfo } from 'react-icons/fi';
import { theme } from 'theme/theme';

import type { PromotedCategoryInfo } from 'contexts/CategoryPromotionContext';

import { CategoryPromotionInfoModal } from './CategoryPromotionInfoModal';

interface CategoryPromotionBadgeProps {
  promotion: PromotedCategoryInfo;
}

/**
 * Shown on an auto-generated category: a "Promoted {date}" label plus an info
 * icon that opens the full promotion rationale (reasoning + considered
 * duplicate candidates).
 */
export const CategoryPromotionBadge: React.FC<CategoryPromotionBadgeProps> = ({ promotion }) => {
  const { t, i18n } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
        {promotion.promotedAt
          ? t('settings.categoryPromotion.promotedOn', {
              date: new Date(promotion.promotedAt).toLocaleDateString(i18n.language),
            })
          : t('settings.categoryPromotion.promotedLabel')}
      </span>
      <button
        type="button"
        onClick={() => setShowInfo(true)}
        title={t('settings.categoryPromotion.infoTooltip')}
        aria-label={t('settings.categoryPromotion.infoTooltip')}
        style={{
          cursor: 'pointer',
          color: theme.colors.primary.main,
          border: 'none',
          background: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <FiInfo size={13} />
      </button>
      {showInfo && <CategoryPromotionInfoModal promotion={promotion} onClose={() => setShowInfo(false)} />}
    </div>
  );
};
