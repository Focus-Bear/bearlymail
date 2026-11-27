import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { OPACITY_FULL, OPACITY_HALF, Z_INDEX_POPUP } from 'constants/numbers';
import { GMAIL_WRITE_NOTICE_DISMISS_PATH, GOOGLE_PERMISSION_GMAIL_MANAGE, STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useGooglePermission } from 'hooks/useGooglePermission';

const ICON_MANAGE = '🗂️';

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: Z_INDEX_POPUP,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.warning.light,
  borderBottom: `1px solid ${theme.colors.warning.main}`,
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.sm,
};

const messageStyle: React.CSSProperties = { flex: '1 1 240px', margin: 0 };

const allowButtonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.sm,
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dismissButtonStyle: React.CSSProperties = {
  background: STRING_NONE,
  border: STRING_NONE,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xl,
  lineHeight: 1,
  padding: theme.spacing.xs,
  color: theme.colors.text.secondary,
};

interface GmailWriteNoticeBannerViewProps {
  isRedirecting: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

export const GmailWriteNoticeBannerView: React.FC<GmailWriteNoticeBannerViewProps> = ({
  isRedirecting,
  onAllow,
  onDismiss,
}) => {
  const { t } = useTranslation();
  return (
    <div role="status" style={bannerStyle} data-testid="gmail-write-notice">
      <span aria-hidden>{ICON_MANAGE}</span>
      <p style={messageStyle}>{t('googlePermissions.writeNotice.message')}</p>
      <button
        type="button"
        onClick={onAllow}
        disabled={isRedirecting}
        style={{ ...allowButtonStyle, opacity: isRedirecting ? OPACITY_HALF : OPACITY_FULL }}
      >
        {t('googlePermissions.writeNotice.allow')}
      </button>
      <button type="button" onClick={onDismiss} aria-label={t('common.dismiss')} style={dismissButtonStyle}>
        ×
      </button>
    </div>
  );
};

/**
 * One-time notice for a read-only Gmail grant: a background job (archive
 * workflow, blocked sender, snooze return…) changed something in BearlyMail
 * but couldn't make the same change in Gmail. Granting gmail.modify or
 * dismissing it hides it for good.
 */
export const GmailWriteNoticeBanner: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { isRedirecting, requestPermission } = useGooglePermission(GOOGLE_PERMISSION_GMAIL_MANAGE);
  const [isDismissed, setIsDismissed] = useState(false);

  if (!user?.showGmailWriteNotice || isDismissed) {
    return null;
  }

  const handleDismiss = async () => {
    setIsDismissed(true);
    try {
      await axios.post(`${API_URL}${GMAIL_WRITE_NOTICE_DISMISS_PATH}`);
      await refreshUser();
    } catch (err: unknown) {
      // Hidden for this session either way; it may come back after a reload.
      console.warn('Failed to dismiss the Gmail write notice:', err);
    }
  };

  return <GmailWriteNoticeBannerView isRedirecting={isRedirecting} onAllow={requestPermission} onDismiss={handleDismiss} />;
};
