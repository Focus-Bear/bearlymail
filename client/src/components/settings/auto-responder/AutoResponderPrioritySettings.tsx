import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface AutoResponderPrioritySettingsProps {
  sendFor: {
    standardPriority: boolean;
    highPriority: boolean;
    lowPriority: boolean;
  };
  onChange: (priority: 'standardPriority' | 'highPriority' | 'lowPriority', value: boolean) => void;
}

export const AutoResponderPrioritySettings: React.FC<AutoResponderPrioritySettingsProps> = ({ sendFor, onChange }) => {
  const { t } = useTranslation();

  const priorities = [
    {
      key: 'highPriority' as const,
      label: 'High Priority',
      description: 'Urgent emails that need quick attention',
      emoji: '🔥',
    },
    {
      key: 'standardPriority' as const,
      label: 'Standard Priority',
      description: 'Normal emails in the action queue',
      emoji: '📬',
    },
    {
      key: 'lowPriority' as const,
      label: 'Low Priority',
      description: 'Non-urgent, informational emails',
      emoji: '📭',
    },
  ];

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
      }}
    >
      <h3
        style={{
          ...theme.typography.heading.h6,
          color: theme.colors.text.primary,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('settings.autoResponder.priority.title')}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {priorities.map(priority => (
          <label
            key={priority.key}
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
              checked={sendFor[priority.key]}
              onChange={event => onChange(priority.key, event.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                accentColor: theme.colors.primary.main,
                cursor: 'pointer',
                marginTop: '2px',
              }}
            />
            <div>
              <div
                style={{
                  ...theme.typography.body.xLarge,
                  fontWeight: theme.typography.fontWeight.medium,
                  color: theme.colors.text.primary,
                }}
              >
                {priority.emoji} {priority.label}
              </div>
              <div
                style={{
                  ...theme.typography.body.medium,
                  color: theme.colors.text.tertiary,
                }}
              >
                {priority.description}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};
