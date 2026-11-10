import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { redirectToGooglePermissionGrant } from 'utils/googlePermissionGrant';
import {
  clearPendingAction,
  GooglePermissionPrompt,
  registerGooglePermissionPromptHandler,
  savePendingAction,
} from 'utils/googlePermissionRequired';

import { OPACITY_DISABLED, OPACITY_FULL, OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { GOOGLE_PERMISSION_GMAIL_SEND, STRING_NONE } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';

const TITLE_ID = 'google-permission-explainer-title';
const ICON_MANAGE = '🗂️';
const ICON_SEND = '📤';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: `rgba(0, 0, 0, ${OPACITY_HALF})`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: Z_INDEX_MODAL_OVERLAY,
  padding: theme.spacing.lg,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.xl,
  maxWidth: '440px',
  width: '100%',
  boxShadow: theme.shadows.xl,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: theme.spacing.sm,
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.xl,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: theme.spacing.sm,
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
  lineHeight: 1.5,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.spacing.sm,
  justifyContent: 'flex-end',
  marginTop: theme.spacing.lg,
};

function buttonStyle(isPrimary: boolean, isBusy: boolean): React.CSSProperties {
  return {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: isPrimary ? theme.colors.primary.main : theme.colors.common.transparent,
    color: isPrimary ? theme.colors.common.white : theme.colors.text.secondary,
    border: isPrimary ? STRING_NONE : `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: isPrimary ? theme.typography.fontWeight.medium : undefined,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    opacity: isBusy ? OPACITY_DISABLED : OPACITY_FULL,
  };
}

interface GooglePermissionExplainerViewProps {
  prompt: GooglePermissionPrompt;
  isRedirecting: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * Says, before Google's consent screen, why BearlyMail needs one more
 * permission for the action the user just took.
 */
export const GooglePermissionExplainerView: React.FC<GooglePermissionExplainerViewProps> = ({
  prompt,
  isRedirecting,
  onContinue,
  onCancel,
}) => {
  const { t } = useTranslation();
  const keyPrefix = `googlePermissions.explainer.${prompt.permission}`;
  const reason = prompt.action
    ? t(`googlePermissions.explainer.actions.${prompt.action}`)
    : t(`${keyPrefix}.reason`);
  const icon = prompt.permission === GOOGLE_PERMISSION_GMAIL_SEND ? ICON_SEND : ICON_MANAGE;
  const afterwardsKey = prompt.pendingAction
    ? 'googlePermissions.explainer.afterwardsRetry'
    : 'googlePermissions.explainer.afterwardsTryAgain';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} style={overlayStyle} onClick={onCancel}>
      <div style={cardStyle} onClick={event => event.stopPropagation()} data-testid="google-permission-explainer">
        <h3 id={TITLE_ID} style={titleStyle}>
          <span aria-hidden>{icon}</span> {t(`${keyPrefix}.title`)}
        </h3>
        <p style={bodyStyle}>{reason}</p>
        <p style={bodyStyle}>{t(`${keyPrefix}.reassurance`)}</p>
        <p style={bodyStyle}>{t(afterwardsKey)}</p>
        <div style={buttonRowStyle}>
          <button type="button" onClick={onCancel} disabled={isRedirecting} style={buttonStyle(false, isRedirecting)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={isRedirecting}
            autoFocus
            style={buttonStyle(true, isRedirecting)}
          >
            {isRedirecting ? t('googlePermissions.explainer.redirecting') : t('googlePermissions.explainer.continue')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface OpenPrompt {
  prompt: GooglePermissionPrompt;
  settle: () => void;
}

/**
 * Mounted once at the app root. When an action comes back with the
 * GOOGLE_PERMISSION_REQUIRED 403, shows the explainer; Continue keeps the
 * action for the return trip and goes to Google, Cancel lets the original
 * request fail so the UI rolls back.
 */
export const GooglePermissionExplainer: React.FC = () => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const [openPrompt, setOpenPrompt] = useState<OpenPrompt | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const openPromptRef = useRef<OpenPrompt | null>(null);

  useEffect(() => {
    registerGooglePermissionPromptHandler(
      prompt =>
        new Promise<void>(resolve => {
          // One explainer at a time: a second refusal (e.g. a parallel bulk
          // request) fails on its own rather than stacking dialogs.
          if (openPromptRef.current) {
            resolve();
            return;
          }
          const next = { prompt, settle: resolve };
          openPromptRef.current = next;
          setOpenPrompt(next);
        })
    );
    return () => registerGooglePermissionPromptHandler(null);
  }, []);

  const close = () => {
    openPromptRef.current?.settle();
    openPromptRef.current = null;
    setOpenPrompt(null);
    setIsRedirecting(false);
  };

  const handleContinue = async () => {
    if (!openPrompt) {
      return;
    }
    setIsRedirecting(true);
    if (openPrompt.prompt.pendingAction) {
      savePendingAction(openPrompt.prompt.pendingAction);
    }
    try {
      await redirectToGooglePermissionGrant(openPrompt.prompt.permission);
    } catch (err: unknown) {
      console.error('Failed to start Google permission grant:', err);
      clearPendingAction();
      showError(t('googlePermissions.startError'));
      close();
    }
  };

  if (!openPrompt) {
    return null;
  }
  return (
    <GooglePermissionExplainerView
      prompt={openPrompt.prompt}
      isRedirecting={isRedirecting}
      onContinue={handleContinue}
      onCancel={close}
    />
  );
};
