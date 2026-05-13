import React from 'react';
import { theme } from 'theme/theme';

interface ModalContentProps {
  children: React.ReactNode;
  maxWidth?: string;
  maxHeight?: string;
}

export const ModalContent: React.FC<ModalContentProps> = ({ children, maxWidth = '500px', maxHeight = '90vh' }) => {
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        maxWidth,
        maxHeight,
        width: '90%',
        overflowY: 'auto',
        boxShadow: theme.shadows.xl,
      }}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      {children}
    </div>
  );
};
