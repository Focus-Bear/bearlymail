import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ModalFormActionsProps {
  loading: boolean;
  disabled: boolean;
  submitLabel: string;
  loadingLabel?: string;
  onCancel: () => void;
}

export const ModalFormActions: React.FC<ModalFormActionsProps> = ({
  loading,
  disabled,
  submitLabel,
  loadingLabel,
  onCancel,
}) => {
  const { t } = useTranslation();
  const isDisabled = loading || disabled;

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: isDisabled ? theme.colors.border.medium : theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {loading ? loadingLabel || t('common.loading') : submitLabel}
      </button>
    </div>
  );
};
