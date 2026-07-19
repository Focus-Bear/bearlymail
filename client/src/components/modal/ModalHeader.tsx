import React from 'react';
import { theme } from 'theme/theme';

interface ModalHeaderProps {
  title: string;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title }) => {
  return (
    <h3
      style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.bold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
      }}
    >
      {title}
    </h3>
  );
};
