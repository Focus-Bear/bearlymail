import React from 'react';
import { theme } from 'theme/theme';

interface AutoResponderToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AutoResponderToggle: React.FC<AutoResponderToggleProps> = ({
  enabled,
  onToggle,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
      backgroundColor: enabled ? theme.colors.success.light : theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${enabled ? theme.colors.success.main : theme.colors.border.light}`,
    }}>
      <div>
        <div style={{
          ...theme.typography.body.xLarge,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {enabled ? 'Auto-Responder Enabled' : 'Auto-Responder Disabled'}
        </div>
        <div style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          marginTop: theme.spacing.xs,
        }}>
          {enabled
            ? 'New emails will receive automatic responses based on your settings.'
            : 'No automatic responses will be sent.'}
        </div>
      </div>

      <button
        onClick={() => onToggle(!enabled)}
        style={{
          position: 'relative',
          width: '56px',
          height: '28px',
          backgroundColor: enabled ? theme.colors.success.main : theme.colors.greyscale[400],
          borderRadius: theme.borderRadius.full,
          border: 'none',
          cursor: 'pointer',
          transition: theme.transitions.default,
          flexShrink: 0,
        }}
        aria-label={enabled ? 'Disable auto-responder' : 'Enable auto-responder'}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '30px' : '2px',
            width: '24px',
            height: '24px',
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: theme.transitions.default,
            boxShadow: theme.shadows.sm,
          }}
        />
      </button>
    </div>
  );
};
