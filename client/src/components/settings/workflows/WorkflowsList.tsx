import React from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { WorkflowRule } from './types';

interface WorkflowsListProps {
  rules: WorkflowRule[];
  onToggle: (id: string) => void;
  onEdit: (rule: WorkflowRule) => void;
  onDelete: (id: string) => void;
}

const BUTTON_VARIANT = { PRIMARY: 'primary', SECONDARY: 'secondary', DANGER: 'danger' } as const;

type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT];

const statusBadgeStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background: enabled ? theme.colors.success.light : theme.colors.error.light,
  color: enabled ? theme.colors.success.main : theme.colors.error.dark,
});

export const WorkflowsList: React.FC<WorkflowsListProps> = ({ rules, onToggle, onEdit, onDelete }) => {
  const { t } = useTranslation();

  if (rules.length === 0) {
    return (
      <p
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.secondary,
          textAlign: 'center',
          padding: theme.spacing.xl,
        }}
      >
        {t('settings.workflows.list.emptyState')}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {rules.map(rule => (
        <div
          key={rule.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.default}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
              <span style={{ ...theme.typography.body.large, fontWeight: 600, color: theme.colors.text.primary }}>
                {rule.name}
              </span>
              <span style={statusBadgeStyle(rule.enabled)}>
                {rule.enabled ? t('settings.workflows.list.statusActive') : t('settings.workflows.list.statusDisabled')}
              </span>
            </div>
            <div style={{ marginTop: 4, ...theme.typography.body.small, color: theme.colors.text.secondary }}>
              {describeCondition(rule, t)}
              {' · '}
              {t('settings.workflows.list.actionCount', { count: rule.actions.length })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: theme.spacing.xs, flexShrink: 0 }}>
            <button
              onClick={() => onToggle(rule.id)}
              style={buttonStyle('secondary')}
              title={rule.enabled ? t('settings.workflows.list.disable') : t('settings.workflows.list.enable')}
            >
              {rule.enabled ? t('settings.workflows.list.disable') : t('settings.workflows.list.enable')}
            </button>
            <button onClick={() => onEdit(rule)} style={buttonStyle('secondary')}>
              {t('common.edit')}
            </button>
            <button onClick={() => onDelete(rule.id)} style={buttonStyle('danger')}>
              {t('common.delete')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

function describeCondition(rule: WorkflowRule, translate: TFunction): string {
  const parts: string[] = [];
  const fromPatterns = rule.condition.fromPatterns ?? [];
  const subjectPatterns = rule.condition.subjectPatterns ?? [];

  if (fromPatterns.length > 0) {
    parts.push(
      translate('settings.workflows.list.conditionFrom', {
        value: fromPatterns.slice(0, 2).join(', '),
      }),
    );
  }
  if (subjectPatterns.length > 0) {
    parts.push(
      translate('settings.workflows.list.conditionSubject', {
        value: subjectPatterns.slice(0, 2).join(', '),
      }),
    );
  }
  if (parts.length === 0) {
    return translate('settings.workflows.list.conditionAny');
  }
  return parts.join('; ');
}

function buttonStyle(variant: ButtonVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  };
  if (variant === BUTTON_VARIANT.PRIMARY) {
    return {
      ...base,
      background: theme.colors.primary.main,
      color: theme.colors.background.paper,
      borderColor: theme.colors.primary.main,
    };
  }
  if (variant === BUTTON_VARIANT.DANGER) {
    return {
      ...base,
      background: theme.colors.background.paper,
      color: theme.colors.error.main,
      borderColor: theme.colors.error.main,
    };
  }
  return {
    ...base,
    background: theme.colors.background.paper,
    color: theme.colors.text.primary,
    borderColor: theme.colors.border.default,
  };
}
