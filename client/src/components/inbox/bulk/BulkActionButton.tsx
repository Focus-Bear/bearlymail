import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';

const BULK_BUTTON_BORDER = '1px solid rgba(255, 255, 255, 0.3)';

interface BulkActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const BulkActionButton: React.FC<BulkActionButtonProps> = ({ onClick, children, disabled, style }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: theme.colors.overlay.whiteLight,
        color: COLOR_NAMED_WHITE,
        border: BULK_BUTTON_BORDER,
        borderRadius: theme.borderRadius.sm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: theme.typography.fontSize.sm,
        ...style,
      }}
    >
      {children}
    </button>
  );
};
