import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';

interface BulkActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const BulkActionButton: React.FC<BulkActionButtonProps> = ({ onClick, children }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: theme.colors.overlay.whiteLight,
        color: COLOR_NAMED_WHITE,
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: theme.borderRadius.sm,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      {children}
    </button>
  );
};
