import React from 'react';
import { useTranslation } from 'react-i18next';
import { OrgPlanStatus } from 'queries/useMyOrganization';
import { VolumeUsage } from 'queries/useOrgUsage';
import { theme } from 'theme/theme';

import { TIER_NAME_KEYS, UPGRADE_MAILTO_HREF } from 'components/settings/plan-picker/planPicker.constants';
import { MS_PER_DAY } from 'constants/numbers';

const PLAN_TRIAL: OrgPlanStatus = 'trial';
const PLAN_ACTIVE: OrgPlanStatus = 'active';

const trialBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  borderRadius: '12px',
  padding: '4px 12px',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '16px',
};

const activePlanStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: theme.colors.text.primary,
  marginBottom: '16px',
};

const expiredBoxStyle: React.CSSProperties = {
  border: `1px solid ${theme.colors.error.main}`,
  backgroundColor: theme.colors.error.light,
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
};

const upgradeButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  borderRadius: '6px',
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
};

interface PlanStatusBannerProps {
  volumeUsage?: VolumeUsage;
  /**
   * Opens the in-app plan picker. When omitted, the expired-state Upgrade CTA
   * falls back to the contact-us mailto link.
   */
  onUpgradeClick?: () => void;
}

/**
 * Shows the organisation's plan state at the top of the Team settings section:
 * a "Trial — N days left" badge while trialling, the paid tier name when
 * active, and a prominent free-tier warning with an Upgrade CTA once the
 * trial has expired (unpaid orgs are treated the same as expired ones).
 */
export const PlanStatusBanner: React.FC<PlanStatusBannerProps> = ({ volumeUsage, onUpgradeClick }) => {
  const { t } = useTranslation();

  // Self-hosted deployments have no plans, trials, or limits — show nothing.
  // Older server responses may not carry a plan status yet.
  if (!volumeUsage?.planStatus || volumeUsage.selfHosted) {
    return null;
  }

  const { planStatus, trialEndsAt, tier, emailLimit } = volumeUsage;

  if (planStatus === PLAN_TRIAL) {
    const daysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / MS_PER_DAY))
      : 0;
    return <div style={trialBadgeStyle}>{t('team.settings.planTrialDaysLeft', { count: daysLeft })}</div>;
  }

  if (planStatus === PLAN_ACTIVE) {
    return <div style={activePlanStyle}>{t('team.settings.planActive', { tier: TIER_NAME_KEYS[tier] ? t(TIER_NAME_KEYS[tier]) : tier })}</div>;
  }

  return (
    <div style={expiredBoxStyle}>
      <p style={{ color: theme.colors.error.main, fontSize: '14px', margin: '0 0 12px 0', fontWeight: 500 }}>
        {t('team.settings.planExpiredWarning', { limit: emailLimit })}
      </p>
      {onUpgradeClick ? (
        <button
          style={{ ...upgradeButtonStyle, border: 'none', cursor: 'pointer' }}
          onClick={onUpgradeClick}
          data-testid="plan-upgrade-button"
        >
          {t('team.settings.planUpgrade')}
        </button>
      ) : (
        <a href={UPGRADE_MAILTO_HREF} style={upgradeButtonStyle}>
          {t('team.settings.planUpgrade')}
        </a>
      )}
    </div>
  );
};
