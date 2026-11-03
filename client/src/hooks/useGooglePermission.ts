import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  GOOGLE_PERMISSION_RESULT_PARAM,
  GOOGLE_PERMISSION_URL_PATH,
  IncrementalGooglePermissionGroup,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

/** Where Google should send the user back to: this page, minus any earlier grant result. */
function currentAppPath(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(GOOGLE_PERMISSION_RESULT_PARAM);
  return `${url.pathname}${url.search}`;
}

export interface GooglePermissionRequest {
  /** True only when Google sign-in recorded a grant without this group. */
  isMissing: boolean;
  isRedirecting: boolean;
  /** Sends the user to Google's consent screen for just this group, then back here. */
  requestPermission: () => Promise<void>;
}

/**
 * Incremental Google authorization for calendar or contacts. Users who didn't
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
    captureEvent(ANALYTICS_EVENTS.GOOGLE_PERMISSION_REQUESTED, { permission: group });
    try {
      const response = await axios.get<{ url: string }>(`${API_URL}${GOOGLE_PERMISSION_URL_PATH}`, {
        params: { permission: group, returnTo: currentAppPath() },
      });
      window.location.assign(response.data.url);
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
