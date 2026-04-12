import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { COLOR_WHITE } from 'constants/colors';

interface AddRuleChoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
  onSuggest: () => void;
}

export const AddRuleChoiceDialog: React.FC<AddRuleChoiceDialogProps> = ({
  open,
  onClose,
  onManual,
  onSuggest,
}) => {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10002}>
      <ModalContent>
        <ModalHeaderWithClose
          title={t('settings.deterministicCategoryRules.addRuleChoiceTitle')}
          onClose={onClose}
        />

        <p
          style={{
            margin: `0 0 ${theme.spacing.md} 0`,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('settings.deterministicCategoryRules.addRuleChoiceDescription')}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
          }}
        >
          {/* Suggest for me */}
          <button
            type="button"
            onClick={onSuggest}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.sm,
              border: 'none',
              background: theme.colors.primary.main,
              color: COLOR_WHITE,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
              {t('settings.deterministicCategoryRules.addRuleSuggestOption')}
            </div>
            <div style={{ fontSize: theme.typography.fontSize.xs, opacity: 0.85 }}>
              {t('settings.deterministicCategoryRules.addRuleSuggestDescription')}
            </div>
          </button>

          {/* Create manually */}
          <button
            type="button"
            onClick={onManual}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              background: 'transparent',
              color: theme.colors.text.primary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
              {t('settings.deterministicCategoryRules.addRuleManualOption')}
            </div>
            <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
              {t('settings.deterministicCategoryRules.addRuleManualDescription')}
            </div>
          </button>
        </div>
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};