import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { UserWithSubscription } from 'hooks/useAdminDashboard';
import { UserSubscriptionCard } from 'components/admin/UserSubscriptionCard';

interface SubscriptionsSectionProps {
  users: UserWithSubscription[];
  extendingUserId: string | null;
  extendDays: number;
  onExtendClick: (userId: string) => void;
  onExtendCancel: () => void;
  onExtendTrial: (userId: string) => void;
  onExtendDaysChange: (days: number) => void;
}

export const SubscriptionsSection: React.FC<SubscriptionsSectionProps> = ({
  users,
  extendingUserId,
  extendDays,
  onExtendClick,
  onExtendCancel,
  onExtendTrial,
  onExtendDaysChange,
}) => {
  const { t } = useTranslation();

  return (
    <section>
      <h2 style={{
        fontSize: theme.typography.fontSize.xl,
        fontWeight: theme.typography.fontWeight.bold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.lg,
      }}>
        {t('admin.dashboard.allUsers')} ({users.length})
      </h2>
      {users.length === 0 ? (
        <div style={{
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          textAlign: 'center',
          color: theme.colors.text.secondary,
        }}>
          {t('admin.dashboard.noUsersFound')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {users.map((userData) => (
            <UserSubscriptionCard
              key={userData.id}
              userData={userData}
              extendingUserId={extendingUserId}
              extendDays={extendDays}
              onExtendClick={onExtendClick}
              onExtendCancel={onExtendCancel}
              onExtendTrial={onExtendTrial}
              onExtendDaysChange={onExtendDaysChange}
            />
          ))}
        </div>
      )}
    </section>
  );
};
