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
  /** Optional middle action, e.g. "Save draft" between "Keep editing" and "Discard". */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const outlinedButtonStyle = (color: string): React.CSSProperties => ({
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  backgroundColor: COLOR_TRANSPARENT,
  color,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
  transition: theme.transitions.fast,
});

/**
 * Confirm modal footer component
 */
export const ConfirmModalFooter: React.FC<ConfirmModalFooterProps> = ({
  confirmLabel,
  cancelLabel,
  confirmColor,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacing.sm,
        justifyContent: 'flex-end',
      }}
    >
      {/* Cancel is the safe choice, so it takes focus and answers Enter. */}
      <button autoFocus onClick={onCancel} style={outlinedButtonStyle(theme.colors.text.secondary)}>
        {cancelLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button onClick={onSecondary} style={outlinedButtonStyle(theme.colors.primary.main)}>
          {secondaryLabel}
        </button>
      )}
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
