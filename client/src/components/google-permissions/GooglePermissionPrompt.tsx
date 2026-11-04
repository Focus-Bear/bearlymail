import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface GooglePermissionPromptProps {
  icon: string;
  message: string;
  actionLabel: string;
  isBusy: boolean;
  onAction: () => void;
  testId: string;
}

const promptStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  backgroundColor: theme.colors.background.paper,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

const actionStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
};

/** One-line "we could do more with this Google permission" prompt with its action. */
export const GooglePermissionPrompt: React.FC<GooglePermissionPromptProps> = ({
  icon,
  message,
  actionLabel,
  isBusy,
  onAction,
  testId,
}) => (
  <div style={promptStyle} data-testid={testId}>
    <span aria-hidden>{icon}</span>
    <span style={{ flex: '1 1 200px' }}>{message}</span>
    <button
      type="button"
      onClick={onAction}
      disabled={isBusy}
      style={{ ...actionStyle, opacity: isBusy ? OPACITY_HALF : OPACITY_FULL }}
    >
      {actionLabel}
    </button>
  </div>
);
