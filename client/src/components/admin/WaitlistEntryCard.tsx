import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeTimestamp } from 'utils/dateUtils';

import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';
import {
  PROVIDER_GMAIL,
  PROVIDER_OTHER,
  PROVIDER_OUTLOOK,
  PROVIDER_ZOHO,
  STRING_NONE,
  STRING_TRANSPARENT,
  STRING_WHITE,
} from 'constants/strings';
import { WaitlistEntry } from 'hooks/useAdminDashboard';

interface WaitlistEntryCardProps {
  entry: WaitlistEntry;
  isApproved?: boolean;
  onApprove?: (id: string) => void;
  onDecline?: (id: string) => void;
}

const APPROVED_CHECKMARK = '✓';
const EMAIL_SYSTEM_LABELS: Record<string, string> = {
  [PROVIDER_GMAIL]: 'Gmail/Google Workspace',
  [PROVIDER_OUTLOOK]: 'Outlook/Office365',
  [PROVIDER_ZOHO]: 'Zoho Mail',
};

const getEmailSystemDisplay = (entry: WaitlistEntry): string => {
  if (entry.emailSystem === PROVIDER_OTHER && entry.emailSystemOther) {
    return entry.emailSystemOther;
  }

  if (!entry.emailSystem) {
    return '';
  }

  return EMAIL_SYSTEM_LABELS[entry.emailSystem] ?? entry.emailSystem;
};

export const WaitlistEntryCard: React.FC<WaitlistEntryCardProps> = ({
  entry,
  isApproved = false,
  onApprove,
  onDecline,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.sm,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: isApproved ? OPACITY_DISABLED_ALT : OPACITY_FULL,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {entry.firstName} ({entry.email}) {isApproved ? APPROVED_CHECKMARK : ''}
        </div>
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.sm,
          }}
        >
          {entry.reason}
        </div>
        {entry.emailSystem && (
          <div
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: isApproved ? 0 : theme.spacing.sm,
            }}
          >
            <strong>{t('admin.dashboard.emailSystem')}:</strong> {getEmailSystemDisplay(entry)}
          </div>
        )}
        {!isApproved && (
          <div
            style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {humanizeTimestamp(entry.createdAt)}
          </div>
        )}
      </div>
      {!isApproved && (
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          {onDecline && (
            <button
              onClick={() => onDecline(entry.id)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: STRING_TRANSPARENT,
                color: theme.colors.error.main,
                border: `1px solid ${theme.colors.error.main}`,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {t('admin.dashboard.decline')}
            </button>
          )}
          {onApprove && (
            <button
              onClick={() => onApprove(entry.id)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.secondary.main,
                color: STRING_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {t('admin.dashboard.approve')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
