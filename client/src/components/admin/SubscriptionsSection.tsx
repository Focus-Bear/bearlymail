import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { UserSubscriptionCard } from 'components/admin/UserSubscriptionCard';
import { UserWithSubscription } from 'hooks/useAdminDashboard';

interface SubscriptionsSectionProps {
  users: UserWithSubscription[];
  usersTotal: number;
  usersPage: number;
  usersTotalPages: number;
  extendingUserId: string | null;
  extendDays: number;
  onExtendClick: (userId: string) => void;
  onExtendCancel: () => void;
  onExtendTrial: (userId: string) => void;
  onExtendDaysChange: (days: number) => void;
  onPageChange: (page: number) => void;
  grantingUserId: string | null;
  onGrantClick: (userId: string) => void;
  onGrantCancel: () => void;
  onGrantPlan: (userId: string, tier: string) => void;
  onRevokePlan: (userId: string) => void;
  onResetUsage: (userId: string) => void;
}

export const SubscriptionsSection: React.FC<SubscriptionsSectionProps> = ({
  users,
  usersTotal,
  usersPage,
  usersTotalPages,
  extendingUserId,
  extendDays,
  onExtendClick,
  onExtendCancel,
  onExtendTrial,
  onExtendDaysChange,
  onPageChange,
  grantingUserId,
  onGrantClick,
  onGrantCancel,
  onGrantPlan,
  onRevokePlan,
  onResetUsage,
}) => {
  const { t } = useTranslation();

  return (
    <section>
      <h2
        style={{
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
        }}
      >
        {t('admin.dashboard.allUsers')} ({usersTotal})
      </h2>
      {users.length === 0 ? (
        <div
          style={{
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
            color: theme.colors.text.secondary,
          }}
        >
          {t('admin.dashboard.noUsersFound')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {users.map(userData => (
              <UserSubscriptionCard
                key={userData.id}
                userData={userData}
                extendingUserId={extendingUserId}
                extendDays={extendDays}
                onExtendClick={onExtendClick}
                onExtendCancel={onExtendCancel}
                onExtendTrial={onExtendTrial}
                onExtendDaysChange={onExtendDaysChange}
                grantingUserId={grantingUserId}
                onGrantClick={onGrantClick}
                onGrantCancel={onGrantCancel}
                onGrantPlan={onGrantPlan}
                onRevokePlan={onRevokePlan}
                onResetUsage={onResetUsage}
              />
            ))}
          </div>
          {usersTotalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.md,
                marginTop: theme.spacing.lg,
              }}
            >
              <button
                onClick={() => onPageChange(usersPage - 1)}
                disabled={usersPage <= 1}
                style={{ padding: `${theme.spacing.xs} ${theme.spacing.md}` }}
              >
                {t('common.previous')}
              </button>
              <span style={{ color: theme.colors.text.secondary }}>
                {t('admin.dashboard.pageOf', { page: usersPage, totalPages: usersTotalPages })}
              </span>
              <button
                onClick={() => onPageChange(usersPage + 1)}
                disabled={usersPage >= usersTotalPages}
                style={{ padding: `${theme.spacing.xs} ${theme.spacing.md}` }}
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
