import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { PriorityRuleDto } from 'types/priority-rules.types';
import { PRIORITY_RULE_SOURCE } from 'types/priority-rules.types';

const rowStyle: React.CSSProperties = {
  padding: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.light}`,
  fontSize: theme.typography.fontSize.sm,
};

const badgeStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
};

const btnStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  background: theme.colors.background.paper,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
};

const PERCENT = 100;

export interface PriorityRuleRowProps {
  rule: PriorityRuleDto;
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onEdit: (rule: PriorityRuleDto) => void;
  onDelete: (rule: PriorityRuleDto) => void;
}

export const PriorityRuleRow: React.FC<PriorityRuleRowProps> = ({
  rule,
  onToggleEnabled,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const bandLabel = t(`settings.priorityRules.bands.${rule.band}`);
  const sharePct = Math.round(rule.dominantBandShare * PERCENT);
  const sourceLabel = t(
    rule.source === PRIORITY_RULE_SOURCE.USER ? 'settings.priorityRules.sourceUser' : 'settings.priorityRules.sourceMined'
  );

  return (
    <div style={rowStyle}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontWeight: theme.typography.fontWeight.semibold,
            wordBreak: 'break-word',
          }}
        >
          {rule.sender}
        </span>
        <span style={badgeStyle}>{t('settings.priorityRules.bandBadge', { band: bandLabel })}</span>
        <span style={badgeStyle}>{sourceLabel}</span>
        {!rule.isEnabled && (
          <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
            ({t('settings.priorityRules.disabled')})
          </span>
        )}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            marginLeft: 'auto',
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          <input
            type="checkbox"
            checked={rule.isEnabled}
            onChange={event => onToggleEnabled(rule.id, event.target.checked)}
          />
          {t('settings.priorityRules.enabledToggle')}
        </label>
        <button type="button" style={btnStyle} onClick={() => onEdit(rule)}>
          {t('common.edit')}
        </button>
        <button type="button" style={btnStyle} onClick={() => onDelete(rule)}>
          {t('common.delete')}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {rule.source === PRIORITY_RULE_SOURCE.USER ? (
          <span>{t('settings.priorityRules.manualRule')}</span>
        ) : (
          <span>{t('settings.priorityRules.learnedFrom', { count: rule.sampleCount, share: sharePct })}</span>
        )}
        <span>{t('settings.priorityRules.applied', { count: rule.hitCount })}</span>
      </div>
    </div>
  );
};
