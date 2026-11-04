import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { GOOGLE_PERMISSION_CONTACTS } from 'constants/strings';
import { useGooglePermission } from 'hooks/useGooglePermission';

import { GooglePermissionPrompt } from './GooglePermissionPrompt';

const CONTACTS_ICON = '👥';

/**
 * CRM contacts list notice for Google users who haven't granted contacts:
 * the list only holds people found in their email until they import their
 * Google contacts. Renders nothing once it's granted.
 */
export const ImportGoogleContactsBadge: React.FC = () => {
  const { t } = useTranslation();
  const { isMissing, isRedirecting, requestPermission } = useGooglePermission(GOOGLE_PERMISSION_CONTACTS);
  if (!isMissing) {
    return null;
  }
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <GooglePermissionPrompt
        icon={CONTACTS_ICON}
        message={t('googlePermissions.contacts.message')}
        actionLabel={t('googlePermissions.contacts.action')}
        isBusy={isRedirecting}
        onAction={requestPermission}
        testId="import-google-contacts-badge"
      />
    </div>
  );
};
