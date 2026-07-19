import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ExtendTrialForm } from 'components/admin/ExtendTrialForm';
import { OrgPlanActions } from 'components/admin/OrgPlanActions';
import { OrgPlanChip } from 'components/admin/OrgPlanChip';
import { UserIdBadge } from 'components/admin/UserIdBadge';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { UserWithSubscription } from 'hooks/useAdminDashboard';

interface UserSubscriptionCardProps {
  userData: UserWithSubscription;
  extendingUserId: string | null;
  extendDays: number;
  onExtendClick: (userId: string) => void;
  onExtendCancel: () => void;
  onExtendTrial: (userId: string) => void;
  onExtendDaysChange: (days: number) => void;
  grantingUserId: string | null;
  onGrantClick: (userId: string) => void;
  onGrantCancel: () => void;
  onGrantPlan: (userId: string, tier: string) => void;
  onRevokePlan: (userId: string) => void;
  onResetUsage: (userId: string) => void;
}

export const UserSubscriptionCard: React.FC<UserSubscriptionCardProps> = ({
  userData,
  extendingUserId,
  extendDays,
  onExtendClick,
  onExtendCancel,
  onExtendTrial,
  onExtendDaysChange,
  grantingUserId,
  onGrantClick,
  onGrantCancel,
  onGrantPlan,
  onRevokePlan,
  onResetUsage,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.sm,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
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
            {userData.name || t('admin.dashboard.noName')} ({userData.email})
          </div>
          <UserIdBadge userId={userData.id} />
          <div style={{ marginBottom: theme.spacing.sm }}>
            <OrgPlanChip org={userData.org} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: theme.spacing.lg,
              marginBottom: theme.spacing.sm,
            }}
          >
            <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
              <strong>{t('admin.dashboard.status')}</strong> {userData.subscriptionStatus || t('admin.dashboard.none')}
            </div>
            {userData.subscriptionExpiresAt && (
              <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                <strong>{t('admin.dashboard.expires')}</strong>{' '}
                {new Date(userData.subscriptionExpiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <div
            style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {t('admin.dashboard.joined')}: {new Date(userData.createdAt).toLocaleDateString()}
          </div>
          {(userData.lastLogoutReason || userData.needsRelogin) && (
            <div
              data-testid="user-last-logout"
              style={{
                marginTop: theme.spacing.xs,
                color: userData.needsRelogin ? theme.colors.accent.error : theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.xs,
              }}
            >
              <strong>{t('admin.dashboard.lastLogout')}</strong>{' '}
              {userData.lastLogoutReason || t('admin.dashboard.none')}
              {userData.lastLogoutAt &&
                ` (${new Date(userData.lastLogoutAt).toLocaleString()})`}
              {userData.needsRelogin && ` — ${t('admin.dashboard.needsReloginNow')}`}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
            alignItems: 'flex-end',
          }}
        >
          {extendingUserId === userData.id ? (
            <ExtendTrialForm
              extendDays={extendDays}
              onExtendDaysChange={onExtendDaysChange}
              onExtendTrial={() => onExtendTrial(userData.id)}
              onCancel={onExtendCancel}
            />
          ) : (
            <button
              onClick={() => onExtendClick(userData.id)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.secondary.main,
                color: COLOR_NAMED_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('admin.dashboard.extendTrial')}
            </button>
          )}
          <OrgPlanActions
            userId={userData.id}
            org={userData.org}
            isGranting={grantingUserId === userData.id}
            onGrantClick={onGrantClick}
            onGrantCancel={onGrantCancel}
            onGrantPlan={onGrantPlan}
            onRevokePlan={onRevokePlan}
            onResetUsage={onResetUsage}
          />
        </div>
      </div>
    </div>
  );
};
