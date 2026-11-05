import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  GOOGLE_PERMISSION_ACTION_RETRIED_EVENT,
  PendingGooglePermissionAction,
  replayPendingAction,
  takePendingAction,
} from 'utils/googlePermissionRequired';

import {
  GOOGLE_PERMISSION_RESULT_DECLINED,
  GOOGLE_PERMISSION_RESULT_GRANTED,
  GOOGLE_PERMISSION_RESULT_PARAM,
  GOOGLE_PERMISSION_RESULT_WRONG_ACCOUNT,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

const RESULT_MESSAGE_KEYS: Record<string, string> = {
  [GOOGLE_PERMISSION_RESULT_GRANTED]: 'googlePermissions.result.granted',
  [GOOGLE_PERMISSION_RESULT_DECLINED]: 'googlePermissions.result.declined',
  [GOOGLE_PERMISSION_RESULT_WRONG_ACCOUNT]: 'googlePermissions.result.wrongAccount',
};

/**
 * Renders nothing. When Google sends the user back from granting a permission,
 * says how it went, reloads the user so the prompts disappear, retries the
 * action that needed the permission (archive, send…), and removes the result
 * from the URL so a reload doesn't repeat it.
 */
export const GooglePermissionResultListener: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { showSuccess, showError } = useNotifications();

  useEffect(() => {
    const retryPendingAction = async (pendingAction: PendingGooglePermissionAction) => {
      try {
        await replayPendingAction(pendingAction);
        window.dispatchEvent(new Event(GOOGLE_PERMISSION_ACTION_RETRIED_EVENT));
        showSuccess(t('googlePermissions.result.grantedAndRetried'));
      } catch (err: unknown) {
        console.error('Retrying the action after the Google grant failed:', err);
        showError(t('googlePermissions.result.retryFailed'));
      }
    };

    const params = new URLSearchParams(location.search);
    const result = params.get(GOOGLE_PERMISSION_RESULT_PARAM);
    if (!result) {
      return;
    }
    params.delete(GOOGLE_PERMISSION_RESULT_PARAM);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true }
    );
    const messageKey = RESULT_MESSAGE_KEYS[result];
    if (!messageKey) {
      return;
    }
    // Taken on every outcome so a declined grant never retries later.
    const pendingAction = takePendingAction();
    if (result !== GOOGLE_PERMISSION_RESULT_GRANTED) {
      showError(t(messageKey));
      return;
    }
    void refreshUser();
    if (pendingAction) {
      void retryPendingAction(pendingAction);
      return;
    }
    showSuccess(t(messageKey));
  }, [location.search, location.pathname, location.hash, navigate, refreshUser, showSuccess, showError, t]);

  return null;
};
