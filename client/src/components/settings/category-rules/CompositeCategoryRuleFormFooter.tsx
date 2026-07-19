import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT, COLOR_WHITE } from 'constants/colors';
import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';

export interface CompositeCategoryRuleFormFooterProps {
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const CompositeCategoryRuleFormFooter: React.FC<CompositeCategoryRuleFormFooterProps> = ({
  saving,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          background: COLOR_TRANSPARENT,
          cursor: 'pointer',
        }}
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          border: 'none',
          borderRadius: theme.borderRadius.sm,
          background: theme.colors.primary.main,
          color: COLOR_WHITE,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? OPACITY_DISABLED_ALT : OPACITY_FULL,
        }}
      >
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
};
