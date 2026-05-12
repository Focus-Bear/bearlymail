import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';

/** Dark amber-brown that has high contrast against warning.light. Not in the
 * theme palette today; introduced for ribbon readability. */
const RIBBON_TEXT_COLOR = '#7A3E00';

/**
 * Full-width ribbon shown at the top of an email card when the email broke
 * through the regular batch window because it was identified as high
 * priority. Positioned absolutely; the parent card must be `position:
 * relative` and reserve top padding for the ribbon.
 */
export const EmergencyDeliveryRibbon: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      title={t('inbox.emergencyDeliveryTooltip')}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        background: theme.colors.warning.light,
        color: RIBBON_TEXT_COLOR,
        fontSize: theme.typography.fontSize.sm,
        fontWeight: FONT_WEIGHT_SEMIBOLD,
        textAlign: 'center',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: `1px solid ${theme.colors.warning.main}`,
      }}
    >
      {t('inbox.emergencyDelivery')}
    </div>
  );
};
