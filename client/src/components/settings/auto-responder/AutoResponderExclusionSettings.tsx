import React from 'react';
import { theme } from 'theme/theme';

interface AutoResponderExclusionSettingsProps {
  excludeAutomated: boolean;
  excludeNewsletters: boolean;
  excludeColdOutreach: boolean;
  onChange: (exclusion: 'excludeAutomated' | 'excludeNewsletters' | 'excludeColdOutreach', value: boolean) => void;
}

export const AutoResponderExclusionSettings: React.FC<AutoResponderExclusionSettingsProps> = ({
  excludeAutomated,
  excludeNewsletters,
  excludeColdOutreach,
  onChange,
}) => {
  const exclusions = [
    {
      key: 'excludeAutomated' as const,
      label: 'Automated Emails',
      description: 'System notifications, alerts, receipts',
      value: excludeAutomated,
      emoji: '🤖',
    },
    {
      key: 'excludeNewsletters' as const,
      label: 'Newsletters',
      description: 'Marketing emails, digests, promotions',
      value: excludeNewsletters,
      emoji: '📰',
    },
    {
      key: 'excludeColdOutreach' as const,
      label: 'Cold Outreach',
      description: 'Unsolicited sales and outreach emails',
      value: excludeColdOutreach,
      emoji: '❄️',
    },
  ];

  return (
    <div style={{
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    }}>
      <h3 style={{
        ...theme.typography.heading.h6,
        color: theme.colors.text.primary,
        marginTop: 0,
        marginBottom: theme.spacing.md,
      }}>
        Don't Send To
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {exclusions.map((exclusion) => (
          <label
            key={exclusion.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: theme.spacing.sm,
              cursor: 'pointer',
              padding: theme.spacing.sm,
              borderRadius: theme.borderRadius.sm,
              transition: theme.transitions.fast,
            }}
          >
            <input
              type="checkbox"
              checked={exclusion.value}
              onChange={(e) => onChange(exclusion.key, e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                accentColor: theme.colors.primary.main,
                cursor: 'pointer',
                marginTop: '2px',
              }}
            />
            <div>
              <div style={{
                ...theme.typography.body.xLarge,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.text.primary,
              }}>
                {exclusion.emoji} {exclusion.label}
              </div>
              <div style={{
                ...theme.typography.body.medium,
                color: theme.colors.text.tertiary,
              }}>
                {exclusion.description}
              </div>
            </div>
          </label>
        ))}
      </div>

      <p style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.tertiary,
        marginTop: theme.spacing.md,
        marginBottom: 0,
        fontStyle: 'italic',
      }}>
        These are detected automatically using email headers and AI analysis.
      </p>
    </div>
  );
};
