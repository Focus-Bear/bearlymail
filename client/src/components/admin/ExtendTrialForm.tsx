import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE, STRING_TRANSPARENT, STRING_WHITE } from 'constants/strings';

const DEFAULT_EXTEND_DAYS = 7;

interface ExtendTrialFormProps {
  extendDays: number;
  onExtendDaysChange: (days: number) => void;
  onExtendTrial: () => void;
  onCancel: () => void;
}

export const ExtendTrialForm: React.FC<ExtendTrialFormProps> = ({
  extendDays,
  onExtendDaysChange,
  onExtendTrial,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
      <input
        type="number"
        value={extendDays}
        onChange={event => onExtendDaysChange(parseInt(event.target.value) || DEFAULT_EXTEND_DAYS)}
        min="1"
        style={{
          width: `${INPUT_WIDTH_PX}px`,
          padding: theme.spacing.xs,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
        }}
      />
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {t('admin.dashboard.days')}
      </span>
      <button
        onClick={onExtendTrial}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary.main,
          color: STRING_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('admin.dashboard.extend')}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: STRING_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};
