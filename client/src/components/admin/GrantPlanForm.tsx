import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanTiers } from 'queries/usePlanTiers';
import { theme } from 'theme/theme';

import { TIER_NAME_KEYS } from 'components/settings/plan-picker/planPicker.constants';
import { STRING_NONE, STRING_POINTER, STRING_TRANSPARENT, STRING_WHITE } from 'constants/strings';

const DEFAULT_TIER = 'bearlymail_starter';

interface GrantPlanFormProps {
  onGrant: (tier: string) => void;
  onCancel: () => void;
}

/**
 * Inline tier picker for granting a complimentary org plan from the admin
 * dashboard. Tier ids/limits come from GET /subscriptions/tiers so the
 * options never drift from the server's VOLUME_TIERS.
 */
export const GrantPlanForm: React.FC<GrantPlanFormProps> = ({ onGrant, onCancel }) => {
  const { t } = useTranslation();
  const { data: tiers } = usePlanTiers();
  const [tier, setTier] = useState(DEFAULT_TIER);

  const tierOptions = tiers?.length
    ? tiers.map(planTier => ({ id: planTier.id, emailsPerCycle: planTier.emailsPerCycle }))
    : Object.keys(TIER_NAME_KEYS).map(id => ({ id, emailsPerCycle: null }));

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
      <select
        value={tier}
        onChange={event => setTier(event.target.value)}
        data-testid="grant-plan-tier-select"
        aria-label={t('admin.dashboard.selectTier')}
        style={{
          padding: theme.spacing.xs,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {tierOptions.map(option => (
          <option key={option.id} value={option.id}>
            {TIER_NAME_KEYS[option.id] ? t(TIER_NAME_KEYS[option.id]) : option.id}
            {option.emailsPerCycle ? ` (${option.emailsPerCycle.toLocaleString()})` : ''}
          </option>
        ))}
      </select>
      <button
        onClick={() => onGrant(tier)}
        data-testid="grant-plan-confirm"
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary.main,
          color: STRING_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: STRING_POINTER,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('admin.dashboard.grant')}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: STRING_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          cursor: STRING_POINTER,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};
