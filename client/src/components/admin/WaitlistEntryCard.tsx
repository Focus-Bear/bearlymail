import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { WaitlistEntry } from 'hooks/useAdminDashboard';
import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';

interface WaitlistEntryCardProps {
  entry: WaitlistEntry;
  isApproved?: boolean;
  onApprove?: (id: string) => void;
}

export const WaitlistEntryCard: React.FC<WaitlistEntryCardProps> = ({
  entry,
  isApproved = false,
  onApprove,
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
        <div style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}>
          {entry.firstName} ({entry.email}) {isApproved ? '✓' : ''}
        </div>
        <div style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: isApproved ? 0 : theme.spacing.sm,
        }}>
          {entry.reason}
        </div>
        {!isApproved && (
          <div style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
          }}>
            {new Date(entry.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
      {!isApproved && onApprove && (
        <button
          onClick={() => onApprove(entry.id)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.secondary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('admin.dashboard.approve')}
        </button>
      )}
    </div>
  );
};


