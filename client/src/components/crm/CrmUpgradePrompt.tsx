import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PlanTier, usePlanTiers } from 'queries/usePlanTiers';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { TIER_NAME_KEYS } from 'components/settings/plan-picker/planPicker.constants';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { SETTINGS_PLANS_ROUTE, STRING_CENTER, STRING_NONE } from 'constants/strings';

const cardStyle: React.CSSProperties = {
  maxWidth: '560px',
  margin: `${theme.spacing.xl} auto`,
  padding: theme.spacing.xl,
  textAlign: STRING_CENTER,
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  boxShadow: theme.shadows.sm,
};

const titleStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.xl,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
};

const descriptionStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.base,
  color: theme.colors.text.secondary,
};

const planNoteStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.lg}`,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

const viewPlansStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  borderRadius: theme.borderRadius.md,
  fontWeight: theme.typography.fontWeight.semibold,
  textDecoration: STRING_NONE,
};

const LOCK_ICON = '🔒';

/** The cheapest tier that includes the CRM, so the prompt quotes the real entry price. */
function findCheapestCrmTier(tiers: PlanTier[] | undefined): PlanTier | undefined {
  return tiers
    ?.filter(tier => tier.includesCrm)
    .reduce<
      PlanTier | undefined
    >((cheapest, tier) => (!cheapest || tier.monthlyPriceUsd < cheapest.monthlyPriceUsd ? tier : cheapest), undefined);
}

/**
 * Shown in place of a CRM page when the user's plan doesn't include the CRM:
 * what the CRM does, the cheapest plan that has it, and a link to the plans.
 */
export const CrmUpgradePrompt: React.FC = () => {
  const { t } = useTranslation();
  const { data: tiers } = usePlanTiers();
  const entryTier = findCheapestCrmTier(tiers);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.CRM_UPGRADE_PROMPT_VIEWED);
  }, []);

  return (
    <div style={cardStyle} data-testid="crm-upgrade-prompt">
      <div style={{ fontSize: '40px', marginBottom: theme.spacing.md }} aria-hidden>
        {LOCK_ICON}
      </div>
      <h2 style={titleStyle}>{t('crm.upgrade.title')}</h2>
      <p style={descriptionStyle}>{t('crm.upgrade.description')}</p>
      {entryTier && (
        <p style={planNoteStyle} data-testid="crm-upgrade-plan-note">
          {t('crm.upgrade.planNote', {
            plan: TIER_NAME_KEYS[entryTier.id] ? t(TIER_NAME_KEYS[entryTier.id]) : entryTier.id,
            price: entryTier.monthlyPriceUsd,
          })}
        </p>
      )}
      <Link
        to={SETTINGS_PLANS_ROUTE}
        style={viewPlansStyle}
        onClick={() => captureEvent(ANALYTICS_EVENTS.CRM_UPGRADE_VIEW_PLANS_CLICKED)}
      >
        {t('crm.upgrade.viewPlans')}
      </Link>
    </div>
  );
};
