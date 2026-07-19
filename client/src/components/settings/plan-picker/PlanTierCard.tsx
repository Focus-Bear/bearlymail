import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlanTier } from 'queries/usePlanTiers';
import { theme } from 'theme/theme';

import { TIER_NAME_KEYS } from 'components/settings/plan-picker/planPicker.constants';

const cardStyle: React.CSSProperties = {
  flex: '1 1 160px',
  minWidth: '160px',
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: '8px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  backgroundColor: theme.colors.background.paper,
};

const currentCardStyle: React.CSSProperties = {
  ...cardStyle,
  border: `2px solid ${theme.colors.primary.main}`,
};

const tierNameStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: theme.colors.text.primary,
};

const priceStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: theme.colors.text.primary,
};

const allowanceStyle: React.CSSProperties = {
  fontSize: '13px',
  color: theme.colors.text.secondary,
  flex: 1,
};

const currentBadgeStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  borderRadius: '10px',
  padding: '2px 10px',
  fontSize: '12px',
  fontWeight: 600,
};

interface PlanTierCardProps {
  tier: PlanTier;
  isCurrent: boolean;
  /** The tier's action area (Choose button, mailto link, or nothing for members). */
  action: React.ReactNode;
}

/**
 * A single plan card in the plan picker: tier name, monthly price, email
 * allowance, and a caller-supplied action. The org's current tier gets a
 * highlighted border and a "Current plan" badge.
 */
export const PlanTierCard: React.FC<PlanTierCardProps> = ({ tier, isCurrent, action }) => {
  const { t } = useTranslation();
  const tierName = TIER_NAME_KEYS[tier.id] ? t(TIER_NAME_KEYS[tier.id]) : tier.id;

  return (
    <div style={isCurrent ? currentCardStyle : cardStyle} data-testid={`plan-tier-card-${tier.id}`}>
      {isCurrent && <span style={currentBadgeStyle}>{t('team.settings.planPicker.currentPlan')}</span>}
      <div style={tierNameStyle}>{tierName}</div>
      <div style={priceStyle}>{t('team.settings.planPicker.pricePerMonth', { price: tier.monthlyPriceUsd })}</div>
      <div style={allowanceStyle}>
        {t('team.settings.planPicker.emailsPerCycle', { count: tier.emailsPerCycle })}
      </div>
      {action}
    </div>
  );
};
