import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import {
  getEmailCategoryDescriptionFromContextValue,
  getEmailCategoryDisplayNameFromContextValue,
} from 'utils/emailCategoryContextUtils';

import { useAuth } from 'contexts/AuthContext';
import { useCategoryPromotion } from 'contexts/CategoryPromotionContext';

import { CategoryPromotionBadge } from './CategoryPromotionBadge';

interface EmailCategoryContextDisplayProps {
  contextId: string;
  contextValue: string;
}

/**
 * Renders an EMAIL_CATEGORY row's name + description, the admin-only UUID, and
 * (for auto-generated categories) a promotion badge linking to the promotion
 * rationale. Split out of `ContextItemContent` to keep that component's
 * complexity in check.
 */
export const EmailCategoryContextDisplay: React.FC<EmailCategoryContextDisplayProps> = ({
  contextId,
  contextValue,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const promotionContext = useCategoryPromotion();

  const description = getEmailCategoryDescriptionFromContextValue(contextValue);
  const promotion = promotionContext ? promotionContext.getPromotion(contextId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, width: '100%' }}>
      <span style={{ color: theme.colors.text.primary, wordBreak: 'break-word' }}>
        {getEmailCategoryDisplayNameFromContextValue(contextValue)}
      </span>
      {description && (
        <span
          style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, wordBreak: 'break-word' }}
        >
          {description}
        </span>
      )}
      {user?.isAdmin && (
        <span
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
            fontFamily: 'monospace',
            userSelect: 'all',
          }}
        >
          {t('settings.emailCategories.categoryUuid', { uuid: contextId })}
        </span>
      )}
      {promotion && <CategoryPromotionBadge promotion={promotion} />}
    </div>
  );
};
