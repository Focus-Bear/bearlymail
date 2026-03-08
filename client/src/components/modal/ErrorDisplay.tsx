import React from 'react';
import { theme } from 'theme/theme';

interface ErrorDisplayProps {
  error: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  if (!error) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.error}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.accent.error,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      {error}
    </div>
  );
};
