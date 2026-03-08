import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { WaitlistEmptyState } from 'components/admin/WaitlistEmptyState';
import { WaitlistEntryCard } from 'components/admin/WaitlistEntryCard';
import { WaitlistEntry } from 'hooks/useAdminDashboard';

interface WaitlistSectionProps {
  pending: WaitlistEntry[];
  approved: WaitlistEntry[];
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}

export const WaitlistSection: React.FC<WaitlistSectionProps> = ({ pending, approved, onApprove, onDecline }) => {
  const { t } = useTranslation();

  return (
    <>
      <section style={{ marginBottom: theme.spacing['2xl'] }}>
        <h2
          style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
          }}
        >
          {t('admin.dashboard.pendingApproval')} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <WaitlistEmptyState messageKey="admin.dashboard.noPendingRequests" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {pending.map(entry => (
              <WaitlistEntryCard key={entry.id} entry={entry} onApprove={onApprove} onDecline={onDecline} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2
          style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
          }}
        >
          {t('admin.dashboard.approved')} ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <WaitlistEmptyState messageKey="admin.dashboard.noApprovedEntries" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {approved.map(entry => (
              <WaitlistEntryCard key={entry.id} entry={entry} isApproved />
            ))}
          </div>
        )}
      </section>
    </>
  );
};
