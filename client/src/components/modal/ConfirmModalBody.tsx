import React from 'react';
import { theme } from 'theme/theme';

interface ConfirmModalBodyProps {
  message: string;
}

/**
 * Confirm modal body component
 */
export const ConfirmModalBody: React.FC<ConfirmModalBodyProps> = ({ message }) => {
  return (
    <p
      style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
        lineHeight: theme.typography.lineHeight.relaxed,
        margin: 0,
      }}
    >
      {message}
    </p>
  );
};
