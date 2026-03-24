import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ToneRuleItem } from 'components/settings/guide-ai/ToneRuleItem';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';

interface ToneSettingsSectionProps {
  toneRules: string[];
  newToneRule: string;
  onAddToneRule: () => void;
  onRemoveToneRule: (index: number) => void;
  onEditToneRule?: (index: number, newValue: string) => void;
  onNewToneRuleChange: (rule: string) => void;
}

interface ToneRulesContentProps {
  toneRules: string[];
  newToneRule: string;
  onAddToneRule: () => void;
  onRemoveToneRule: (index: number) => void;
  onEditToneRule?: (index: number, newValue: string) => void;
  onNewToneRuleChange: (rule: string) => void;
}

const ToneRulesContent: React.FC<ToneRulesContentProps> = ({
  toneRules,
  newToneRule,
  onAddToneRule,
  onRemoveToneRule,
  onEditToneRule,
  onNewToneRuleChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: theme.spacing.md }}>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.lg,
        }}
      >
        {t('settings.toneConfig')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {toneRules.map((rule, position) => {
          const ruleHash = rule.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const key = `tone-rule-${ruleHash}-pos${position}`;
          return (
            <ToneRuleItem
              key={key}
              rule={rule}
              index={position}
              onRemove={() => onRemoveToneRule(position)}
              onEdit={onEditToneRule}
            />
          );
        })}
        <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <input
            type="text"
            value={newToneRule}
            onChange={event => onNewToneRuleChange(event.target.value)}
            onKeyDown={event => event.key === KEY_ENTER && onAddToneRule()}
            placeholder={t('settings.addRulePlaceholder')}
            style={{
              flex: 1,
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
            }}
          />
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.TONE_RULE_ADDED);
              onAddToneRule();
            }}
            disabled={!newToneRule.trim()}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.secondary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              cursor: newToneRule.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {t('settings.addRule')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ToneSettingsSection: React.FC<ToneSettingsSectionProps> = ({
  toneRules,
  newToneRule,
  onAddToneRule,
  onRemoveToneRule,
  onEditToneRule,
  onNewToneRuleChange,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const itemCount = toneRules.length;

  return (
    <div
      id="tone-settings"
      style={{
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.primary,
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          cursor: 'pointer',
          backgroundColor: theme.colors.background.paper,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
          borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md,
          transition: theme.transitions.fast,
        }}
      >
        <span
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: theme.transitions.fast,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{t('settings.howIWrite')}</span>
        <span
          style={{
            backgroundColor: theme.colors.greyscale[300],
            color: theme.colors.text.secondary,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.full,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {itemCount}
        </span>
      </div>

      {isExpanded && (
        <ToneRulesContent
          toneRules={toneRules}
          newToneRule={newToneRule}
          onAddToneRule={onAddToneRule}
          onRemoveToneRule={onRemoveToneRule}
          onEditToneRule={onEditToneRule}
          onNewToneRuleChange={onNewToneRuleChange}
        />
      )}
    </div>
  );
};
