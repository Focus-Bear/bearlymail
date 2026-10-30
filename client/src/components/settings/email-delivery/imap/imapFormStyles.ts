import type React from 'react';
import { theme } from 'theme/theme';

export const imapLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.text.primary,
};

export const imapInputStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.sm,
  fontSize: theme.typography.fontSize.sm,
  boxSizing: 'border-box',
  color: theme.colors.text.primary,
  backgroundColor: theme.colors.background.paper,
};

export const imapHintStyle: React.CSSProperties = {
  margin: 0,
  marginTop: theme.spacing.xs,
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.xs,
};

export const imapFieldStyle: React.CSSProperties = { marginBottom: theme.spacing.md };
