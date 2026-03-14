import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeTimestamp } from 'utils/dateUtils';

import { SAVE_CONFIRMATION_DURATION_MS } from 'constants/numbers';
import { useNotifications } from 'contexts/NotificationContext';

const COPY_ICON = '⧉';
const ICON_EXPANDED = '▼';
const ICON_COLLAPSED = '▶';
const getHeaderBgColor = (isCurrentEmail: boolean): string =>
  isCurrentEmail ? theme.colors.primary.subtle : theme.colors.background.subtle;

interface AddressFieldProps {
  label: string;
  value: string;
}
const AddressField: React.FC<AddressFieldProps> = ({ label, value }) => (
  <div
    style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}
  >
    <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{label}:</span> {value}
  </div>
);

interface ThreadItemHeaderProps {
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  receivedAt: string;
  isExpanded: boolean;
  isCurrentEmail: boolean;
  onToggle: () => void;
}

export const ThreadItemHeader: React.FC<ThreadItemHeaderProps> = ({
  from,
  fromName,
  to,
  cc,
  receivedAt,
  isExpanded,
  isCurrentEmail,
  onToggle,
}) => {
  const { t } = useTranslation();
  const { showSuccess } = useNotifications();
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(from);
      setEmailCopied(true);
      showSuccess(t('emailDetail.emailCopied'));
      setTimeout(() => setEmailCopied(false), SAVE_CONFIRMATION_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  }, [from, showSuccess, t]);

  return (
    <div
      onClick={onToggle}
      style={{
        padding: theme.spacing.md,
        backgroundColor: getHeaderBgColor(isCurrentEmail),
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
          <strong style={{ color: theme.colors.text.primary }}>{fromName || from}</strong>
          {from && fromName && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <span
                onClick={event => {
                  event.stopPropagation();
                  handleCopyEmail();
                }}
                title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                style={{
                  fontSize: theme.typography.fontSize.xs,
                  color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                  cursor: 'pointer',
                }}
              >
                &lt;{from}&gt;
              </span>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  handleCopyEmail();
                }}
                title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                aria-label={t('emailDetail.clickToCopyEmail')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                  lineHeight: 1,
                }}
              >
                {COPY_ICON}
              </button>
            </span>
          )}
          <span style={{ color: theme.colors.text.secondary }}>
            {humanizeTimestamp(new Date(receivedAt), { showAbsoluteDate: true })}
          </span>
        </div>
        {to && <AddressField label={t('emailDetail.to', { defaultValue: 'To' })} value={to} />}
        {cc && <AddressField label={t('emailDetail.cc', { defaultValue: 'CC' })} value={cc} />}
      </div>
      <span style={{ color: theme.colors.text.tertiary }}>{isExpanded ? ICON_EXPANDED : ICON_COLLAPSED}</span>
    </div>
  );
};
