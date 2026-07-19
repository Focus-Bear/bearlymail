import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { GrantPlanForm } from 'components/admin/GrantPlanForm';
import { STRING_NONE, STRING_POINTER, STRING_TRANSPARENT, STRING_WHITE } from 'constants/strings';
import { AdminOrgPlanInfo } from 'hooks/useAdminDashboard';

const DISABLED_OPACITY = 0.5;
const PLAN_ACTIVE = 'active';

interface OrgPlanActionsProps {
  userId: string;
  org: AdminOrgPlanInfo | null | undefined;
  isGranting: boolean;
  onGrantClick: (userId: string) => void;
  onGrantCancel: () => void;
  onGrantPlan: (userId: string, tier: string) => void;
  onRevokePlan: (userId: string) => void;
  onResetUsage: (userId: string) => void;
}

/**
 * Grant / revoke / reset-usage controls for a user's org plan. Grant and
 * revoke are disabled (with an explanatory tooltip) when the org's billing
 * is live in RevenueCat, so admins can't fight real billing from here.
 */
export const OrgPlanActions: React.FC<OrgPlanActionsProps> = ({
  userId,
  org,
  isGranting,
  onGrantClick,
  onGrantCancel,
  onGrantPlan,
  onRevokePlan,
  onResetUsage,
}) => {
  const { t } = useTranslation();
  const rcManaged = org?.hasRevenueCatSubscription === true;
  const rcTitle = rcManaged ? t('admin.dashboard.managedByRevenueCat') : undefined;

  if (isGranting) {
    return <GrantPlanForm onGrant={tier => onGrantPlan(userId, tier)} onCancel={onGrantCancel} />;
  }

  const smallButtonStyle: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSize.sm,
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => onGrantClick(userId)}
        disabled={rcManaged}
        title={rcTitle}
        data-testid="grant-plan-button"
        style={{
          ...smallButtonStyle,
          backgroundColor: theme.colors.primary.main,
          color: STRING_WHITE,
          border: STRING_NONE,
          cursor: rcManaged ? 'not-allowed' : STRING_POINTER,
          opacity: rcManaged ? DISABLED_OPACITY : 1,
        }}
      >
        {t('admin.dashboard.grantPlan')}
      </button>
      {org?.planStatus === PLAN_ACTIVE && (
        <button
          onClick={() => onRevokePlan(userId)}
          disabled={rcManaged}
          title={rcTitle}
          data-testid="revoke-plan-button"
          style={{
            ...smallButtonStyle,
            backgroundColor: STRING_TRANSPARENT,
            color: theme.colors.accent.error,
            border: `1px solid ${theme.colors.accent.error}`,
            cursor: rcManaged ? 'not-allowed' : STRING_POINTER,
            opacity: rcManaged ? DISABLED_OPACITY : 1,
          }}
        >
          {t('admin.dashboard.revokePlan')}
        </button>
      )}
      {org && (
        <button
          onClick={() => onResetUsage(userId)}
          data-testid="reset-usage-button"
          style={{
            ...smallButtonStyle,
            backgroundColor: STRING_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            cursor: STRING_POINTER,
          }}
        >
          {t('admin.dashboard.resetUsage')}
        </button>
      )}
    </div>
  );
};
