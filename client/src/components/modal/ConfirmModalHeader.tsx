import React from 'react';
import { theme } from 'theme/theme';

interface ConfirmModalHeaderProps {
  icon: string;
  title: string;
}

/**
 * Confirm modal header component
 */
export const ConfirmModalHeader: React.FC<ConfirmModalHeaderProps> = ({ icon, title }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}
    >
      <span style={{ fontSize: '2rem' }}>{icon}</span>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {title}
      </h3>
    </div>
  );
};
