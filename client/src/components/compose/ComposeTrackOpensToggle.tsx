import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { InfoTooltip } from 'components/email-detail-inline/InfoTooltip';

interface ComposeTrackOpensToggleProps {
  isTracking: boolean;
  disabled: boolean;
  onChange: (isTracking: boolean) => void;
}

/**
 * Per-message "Track opens" checkbox on the compose page. Starts from the
 * account setting, so turning it off here affects only this message.
 */
export const ComposeTrackOpensToggle: React.FC<ComposeTrackOpensToggleProps> = ({ isTracking, disabled, onChange }) => {
  const { t } = useTranslation();
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        data-testid="compose-track-opens"
        checked={isTracking}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      {t('compose.trackOpens')}
      <InfoTooltip text={t('compose.trackOpensTooltip')} />
    </label>
  );
};
