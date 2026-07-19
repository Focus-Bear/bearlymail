import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  canSubmit?: boolean;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  onCancel,
  onSubmit,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  canSubmit = true,
}) => {
  const isDisabled = !canSubmit || isSubmitting;

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {cancelLabel}
      </button>
      <button
        onClick={onSubmit}
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: isDisabled ? theme.colors.background.subtle : theme.colors.primary.main,
          color: isDisabled ? theme.colors.text.tertiary : 'white',
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {isSubmitting ? 'Submitting...' : submitLabel}
      </button>
    </div>
  );
};
