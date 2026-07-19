import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TIER_NAME_KEYS } from 'components/settings/plan-picker/planPicker.constants';
import { AdminOrgPlanInfo } from 'hooks/useAdminDashboard';

const PLAN_ACTIVE = 'active';
const PLAN_TRIAL = 'trial';

/** Maps an org plan status to its chip colour (green=paid, amber=trial, red otherwise). */
function planStatusColor(planStatus: string): string {
  if (planStatus === PLAN_ACTIVE) {
    return theme.colors.accent.success;
  }
  if (planStatus === PLAN_TRIAL) {
    return theme.colors.accent.warning;
  }
  return theme.colors.accent.error;
}

interface OrgPlanChipProps {
  org: AdminOrgPlanInfo | null | undefined;
}

/**
 * Compact summary of a user's org plan for the admin dashboard:
 * plan status, tier name, email usage against the volume limit,
 * trial end date (while trialling) and a RevenueCat-billing marker.
 */
export const OrgPlanChip: React.FC<OrgPlanChipProps> = ({ org }) => {
  const { t } = useTranslation();

  if (!org) {
    return (
      <span
        data-testid="org-plan-chip"
        style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}
      >
        {t('admin.dashboard.noOrg')}
      </span>
    );
  }

  const tierKey = org.tier ? TIER_NAME_KEYS[org.tier] : undefined;
  const tierName = tierKey ? t(tierKey) : org.tier;

  return (
    <div
      data-testid="org-plan-chip"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      <span
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: planStatusColor(org.planStatus),
        }}
      >
        {t('admin.dashboard.orgPlan')}: {org.planStatus}
        {tierName ? ` · ${tierName}` : ''}
      </span>
      <span>
        {t('admin.dashboard.orgUsage', {
          used: org.emailsUsedThisCycle.toLocaleString(),
          limit: org.emailVolumeLimit.toLocaleString(),
        })}
      </span>
      {org.planStatus === PLAN_TRIAL && org.trialEndsAt && (
        <span>
          {t('admin.dashboard.trialEnds')}: {new Date(org.trialEndsAt).toLocaleDateString()}
        </span>
      )}
      {org.hasRevenueCatSubscription && (
        <span style={{ color: theme.colors.text.tertiary }}>{t('admin.dashboard.revenueCatBilled')}</span>
      )}
    </div>
  );
};
