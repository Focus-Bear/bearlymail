import React from 'react';
import { theme } from 'theme/theme';

interface AutoResponderQASettingsProps {
  qaContextEnabled: boolean;
  qaMinConfidence: number;
  onChange: (settings: { qaContextEnabled?: boolean; qaMinConfidence?: number }) => void;
}

export const AutoResponderQASettings: React.FC<AutoResponderQASettingsProps> = ({
  qaContextEnabled,
  qaMinConfidence,
  onChange,
}) => {
  return (
    <div style={{
      marginTop: theme.spacing.lg,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    }}>
      <h3 style={{
        ...theme.typography.heading.h6,
        color: theme.colors.text.primary,
        marginTop: 0,
        marginBottom: theme.spacing.sm,
      }}>
        🧠 AI-Powered Answers
      </h3>

      <p style={{
        ...theme.typography.body.large,
        color: theme.colors.text.secondary,
        marginTop: 0,
        marginBottom: theme.spacing.md,
      }}>
        When enabled, the auto-responder will try to answer common questions based on your
        previous email conversations.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          cursor: 'pointer',
          marginBottom: theme.spacing.md,
        }}
      >
        <input
          type="checkbox"
          checked={qaContextEnabled}
          onChange={(e) => onChange({ qaContextEnabled: e.target.checked })}
          style={{
            width: '18px',
            height: '18px',
            accentColor: theme.colors.primary.main,
            cursor: 'pointer',
          }}
        />
        <span style={{
          ...theme.typography.body.xLarge,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
        }}>
          Include AI-generated answers in responses
        </span>
      </label>

      {qaContextEnabled && (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.sm,
          padding: theme.spacing.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.sm,
          }}>
            <span style={{
              ...theme.typography.body.large,
              color: theme.colors.text.primary,
            }}>
              Minimum Confidence Threshold
            </span>
            <span style={{
              ...theme.typography.body.large,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.primary.main,
            }}>
              {Math.round(qaMinConfidence * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={qaMinConfidence * 100}
            onChange={(e) => onChange({ qaMinConfidence: parseInt(e.target.value, 10) / 100 })}
            style={{
              width: '100%',
              accentColor: theme.colors.primary.main,
              cursor: 'pointer',
            }}
          />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: theme.spacing.xs,
          }}>
            <span style={{
              ...theme.typography.body.small,
              color: theme.colors.text.tertiary,
            }}>
              More answers (less accurate)
            </span>
            <span style={{
              ...theme.typography.body.small,
              color: theme.colors.text.tertiary,
            }}>
              Fewer answers (more accurate)
            </span>
          </div>

          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            marginTop: theme.spacing.md,
            marginBottom: 0,
          }}>
            Only answers with confidence above this threshold will be included.
            All AI answers include a disclaimer that the user will confirm.
          </p>
        </div>
      )}
    </div>
  );
};
