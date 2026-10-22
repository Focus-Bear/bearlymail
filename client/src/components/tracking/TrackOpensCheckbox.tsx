import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { InfoTooltip } from 'components/email-detail-inline/InfoTooltip';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';
import { useIsEmailTrackingIncluded } from 'hooks/useIsEmailTrackingIncluded';

interface TrackOpensCheckboxProps {
  isTracking: boolean;
  disabled: boolean;
  onChange: (isTracking: boolean) => void;
}

const upgradeLinkStyle: React.CSSProperties = {
  color: theme.colors.primary.main,
  fontWeight: theme.typography.fontWeight.semibold,
};

/**
 * Per-message "Track opens" checkbox for the compose page and the reply
 * composer. Starts from the account setting, so turning it off here affects
 * only this message. On a plan without email tracking it shows unchecked and
 * locked, with a link to the plans (the server won't add a pixel anyway).
 */
export const TrackOpensCheckbox: React.FC<TrackOpensCheckboxProps> = ({ isTracking, disabled, onChange }) => {
  const { t } = useTranslation();
  const isIncludedInPlan = useIsEmailTrackingIncluded();
  const isLocked = disabled || !isIncludedInPlan;
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
        cursor: isLocked ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        data-testid="track-opens-checkbox"
        checked={isIncludedInPlan && isTracking}
        disabled={isLocked}
        onChange={event => onChange(event.target.checked)}
      />
      {t('compose.trackOpens')}
      {isIncludedInPlan ? (
        <InfoTooltip text={t('compose.trackOpensTooltip')} />
      ) : (
        <>
          <InfoTooltip text={t('compose.trackOpensNotIncluded')} />
          <Link to={SETTINGS_PLANS_ROUTE} style={upgradeLinkStyle} data-testid="track-opens-upgrade-link">
            {t('compose.trackOpensUpgrade')}
          </Link>
        </>
      )}
    </label>
  );
};
