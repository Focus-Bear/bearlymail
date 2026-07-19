import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { InfoTooltip } from './InfoTooltip';

interface ActionCheckboxRowProps {
  keepInAction: boolean;
  sending: boolean;
  checkingTone: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * "I still need to take action" checkbox with an info tooltip explaining the behaviour.
 */
export const ActionCheckboxRow: React.FC<ActionCheckboxRowProps> = ({
  keepInAction,
  sending,
  checkingTone,
  onChange,
}) => {
  const { t } = useTranslation();
  const isDisabled = sending || checkingTone;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          checked={keepInAction}
          onChange={onChange}
          disabled={isDisabled}
          style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
        />
        {t('emailDetail.keepInAction')}
        <InfoTooltip text={t('emailDetail.keepInActionTooltip')} />
      </label>
    </div>
  );
};
