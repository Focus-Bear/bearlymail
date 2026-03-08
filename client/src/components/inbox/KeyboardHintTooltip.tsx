import React from 'react';
import { theme } from 'theme/theme';

interface KeyboardHintTooltipProps {
  action: string;
}

export const KeyboardHintTooltip: React.FC<KeyboardHintTooltipProps> = ({ action }) => {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: theme.spacing['2xl'],
        right: theme.spacing['2xl'],
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.lg,
        border: `1px solid ${theme.colors.border.medium}`,
        zIndex: 1000,
        maxWidth: '300px',
      }}
    >
      <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
        💡 {action}
      </div>
    </div>
  );
};
