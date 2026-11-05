import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

export const noteTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  fontFamily: 'inherit',
  resize: 'vertical',
  backgroundColor: theme.colors.background.paper,
  boxSizing: 'border-box',
};

export const primaryButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
};

export const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: STRING_NONE,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
};

export const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.spacing.sm,
  marginTop: theme.spacing.xs,
};
