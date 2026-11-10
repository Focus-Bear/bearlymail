import type React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

export const sectionCardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.lg,
  boxShadow: theme.shadows.md,
  scrollMarginTop: `${INPUT_WIDTH_PX}px`,
};

export const headingStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.xl,
};

export const bodyTextStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.sm,
  lineHeight: 1.5,
};

export const linkStyle: React.CSSProperties = {
  color: theme.colors.primary.main,
  textDecoration: 'underline',
};

export const providerRowStyle: React.CSSProperties = {
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.md,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
};

export const keyInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontFamily: 'monospace',
};

const buttonBase: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  cursor: 'pointer',
};

export const primaryButtonStyle = (isEnabled: boolean): React.CSSProperties => ({
  ...buttonBase,
  backgroundColor: isEnabled ? theme.colors.primary.main : theme.colors.text.tertiary,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  cursor: isEnabled ? 'pointer' : 'not-allowed',
});

export const secondaryButtonStyle: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: theme.colors.background.default,
  color: theme.colors.text.primary,
  border: `1px solid ${theme.colors.border.medium}`,
};

export const dangerButtonStyle: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: theme.colors.accent.error,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
};

export const rejectedNoticeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.error.light,
  color: theme.colors.error.dark,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.sm,
  fontSize: theme.typography.fontSize.sm,
};
