import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { Z_INDEX_POPUP } from 'constants/numbers';
import type { PromotedCategoryInfo } from 'contexts/CategoryPromotionContext';

interface CategoryPromotionInfoModalProps {
  promotion: PromotedCategoryInfo;
  onClose: () => void;
}

/** Renders the LLM verdict for one candidate the dedup pass weighed. */
const CandidateRow: React.FC<{ name: string; isDuplicate: boolean; reasoning: string }> = ({
  name,
  isDuplicate,
  reasoning,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <span style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>{name}</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            padding: '2px 6px',
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.text.inverse,
            backgroundColor: isDuplicate ? theme.colors.accent.error : theme.colors.accent.success,
          }}
        >
          {isDuplicate
            ? t('settings.categoryPromotion.duplicate')
            : t('settings.categoryPromotion.notDuplicate')}
        </span>
      </div>
      {reasoning && (
        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>{reasoning}</span>
      )}
    </div>
  );
};

const CategoryPromotionInfoModalContent: React.FC<CategoryPromotionInfoModalProps> = ({ promotion, onClose }) => {
  const { t, i18n } = useTranslation();
  const promotedAtLabel = promotion.promotedAt
    ? new Date(promotion.promotedAt).toLocaleString(i18n.language)
    : t('settings.categoryPromotion.unknownDate');

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.overlay.darkLight,
          zIndex: 1999,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.xl,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.xl,
          width: '90%',
          maxWidth: '560px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.md,
          zIndex: Z_INDEX_POPUP,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <h3 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.lg }}>
            {t('settings.categoryPromotion.title', { name: promotion.name })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FiX size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <div>
            <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
              {t('settings.categoryPromotion.promotedAt')}
            </div>
            <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm }}>{promotedAtLabel}</div>
          </div>

          <div>
            <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
              {t('settings.categoryPromotion.reasonLabel')}
            </div>
            <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm }}>
              {promotion.promotionReasoning || t('settings.categoryPromotion.noReason')}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
              {t('settings.categoryPromotion.consideredLabel')}
            </div>
            {promotion.duplicateCandidates.length > 0 ? (
              promotion.duplicateCandidates.map(candidate => (
                <CandidateRow
                  key={candidate.name}
                  name={candidate.name}
                  isDuplicate={candidate.isDuplicate}
                  reasoning={candidate.reasoning}
                />
              ))
            ) : (
              <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
                {t('settings.categoryPromotion.noCandidates')}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export const CategoryPromotionInfoModal: React.FC<CategoryPromotionInfoModalProps> = props => (
  <CategoryPromotionInfoModalContent {...props} />
);
