import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { ToneRuleItem } from 'components/settings/guide-ai/ToneRuleItem';
import { KEY_ENTER } from 'constants/strings';

interface ToneSettingsSectionProps {
  toneRules: string[];
  newToneRule: string;
  onAddToneRule: () => void;
  onRemoveToneRule: (index: number) => void;
  onNewToneRuleChange: (rule: string) => void;
}

export const ToneSettingsSection: React.FC<ToneSettingsSectionProps> = ({
  toneRules,
  newToneRule,
  onAddToneRule,
  onRemoveToneRule,
  onNewToneRuleChange,
}) => {
  const { t } = useTranslation();

  return (
    <div id="tone-settings" style={{
      marginBottom: theme.spacing.xl,
      paddingBottom: theme.spacing.lg,
      borderBottom: `1px solid ${theme.colors.border.light}`,
    }}>
      <h3 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.lg,
      }}>
        {t('settings.howIWrite')}
      </h3>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.toneConfig')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {toneRules.map((rule, position) => {
          // Create a stable key using rule content and position
          // Use position (from map) rather than index to avoid ESLint warning
          const ruleHash = rule.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const key = `tone-rule-${ruleHash}-pos${position}`;
          return (
            <ToneRuleItem
              key={key}
              rule={rule}
              index={position}
              onRemove={() => onRemoveToneRule(position)}
            />
          );
        })}
        <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <input
            type="text"
            value={newToneRule}
            onChange={(e) => onNewToneRuleChange(e.target.value)}
            onKeyDown={(e) => e.key === KEY_ENTER && onAddToneRule()}
            placeholder={t('settings.addRulePlaceholder')}
            style={{
              flex: 1,
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
            }}
          />
          <button
            onClick={onAddToneRule}
            disabled={!newToneRule.trim()}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.secondary.main,
              color: 'white',
              border: 'none',
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

