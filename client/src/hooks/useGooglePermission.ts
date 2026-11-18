import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { redirectToGooglePermissionGrant } from 'utils/googlePermissionGrant';

import { IncrementalGooglePermissionGroup } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

export interface GooglePermissionRequest {
  /** True only when Google sign-in recorded a grant without this group. */
  isMissing: boolean;
  isRedirecting: boolean;
  /** Sends the user to Google's consent screen for just this group, then back here. */
  requestPermission: () => Promise<void>;
}

/**
 * Incremental Google authorization for one permission group. Users who didn't
 * sign in with Google, or whose grant predates scope tracking, never see the
 * prompt (missingGooglePermissions is empty for them).
 */
export function useGooglePermission(group: IncrementalGooglePermissionGroup): GooglePermissionRequest {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showError } = useNotifications();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const requestPermission = async () => {
    setIsRedirecting(true);
    try {
      await redirectToGooglePermissionGrant(group);
    } catch (err: unknown) {
      console.error('Failed to start Google permission grant:', err);
      setIsRedirecting(false);
      showError(t('googlePermissions.startError'));
    }
  };

  return {
    isMissing: user?.missingGooglePermissions?.includes(group) ?? false,
    isRedirecting,
    requestPermission,
  };
}
