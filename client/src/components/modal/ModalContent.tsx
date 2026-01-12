import React from 'react';
import { theme } from 'theme/theme';

interface ModalContentProps {
  children: React.ReactNode;
  maxWidth?: string;
  maxHeight?: string;
}

export const ModalContent: React.FC<ModalContentProps> = ({
  children,
  maxWidth = '500px',
  maxHeight,
}) => {
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        maxWidth,
        maxHeight,
        width: '90%',
        overflowY: maxHeight ? 'auto' : undefined,
        boxShadow: theme.shadows.xl,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

