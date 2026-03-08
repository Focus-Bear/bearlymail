import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ConfirmModalFooterProps {
  confirmLabel: string;
  cancelLabel: string;
  confirmColor: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm modal footer component
 */
export const ConfirmModalFooter: React.FC<ConfirmModalFooterProps> = ({
  confirmLabel,
  cancelLabel,
  confirmColor,
  onConfirm,
  onCancel,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacing.sm,
        justifyContent: 'flex-end',
      }}
    >
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
          transition: theme.transitions.fast,
        }}
      >
        {cancelLabel}
      </button>
      <button
        onClick={onConfirm}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: confirmColor,
          color: theme.colors.background.paper,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
          transition: theme.transitions.fast,
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
};
