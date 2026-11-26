import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { CollapsibleSettingsSection } from 'components/settings/CollapsibleSettingsSection';
import { ToneRuleItem } from 'components/settings/guide-ai/ToneRuleItem';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
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
    <>
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
    </>
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
  return (
    <CollapsibleSettingsSection
      anchorId={SETTINGS_ANCHORS.TONE_SETTINGS}
      title={t('settings.howIWrite')}
      itemCount={toneRules.length}
      shouldUnmountBodyWhenCollapsed
    >
      <ToneRulesContent
        toneRules={toneRules}
        newToneRule={newToneRule}
        onAddToneRule={onAddToneRule}
        onRemoveToneRule={onRemoveToneRule}
        onEditToneRule={onEditToneRule}
        onNewToneRuleChange={onNewToneRuleChange}
      />
    </CollapsibleSettingsSection>
  );
};
