import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { GOOGLE_PERMISSION_CALENDAR } from 'constants/strings';
import { useGooglePermission } from 'hooks/useGooglePermission';

import { GooglePermissionPrompt } from './GooglePermissionPrompt';

const CALENDAR_ICON = '📅';

/**
 * Shown with a detected scheduling request when the user hasn't let BearlyMail
 * see their Google Calendar yet: sign-in only asks for Gmail, so this is where
 * calendar access is offered. Renders nothing once it's granted.
 */
export const ConnectCalendarPrompt: React.FC = () => {
  const { t } = useTranslation();
  const { isMissing, isRedirecting, requestPermission } = useGooglePermission(GOOGLE_PERMISSION_CALENDAR);
  if (!isMissing) {
    return null;
  }
  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      <GooglePermissionPrompt
        icon={CALENDAR_ICON}
        message={t('googlePermissions.calendar.message')}
        actionLabel={t('googlePermissions.calendar.action')}
        isBusy={isRedirecting}
        onAction={requestPermission}
        testId="connect-calendar-prompt"
      />
    </div>
  );
};
