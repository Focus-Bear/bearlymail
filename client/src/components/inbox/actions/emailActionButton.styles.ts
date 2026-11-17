import type React from 'react';
import { theme } from 'theme/theme';

export const EMAIL_ACTION_ICON_SIZE = 15;

/**
 * Snooze / Archive on an inbox card: an outlined, labelled button. They were
 * borderless icon+caption links that read as decoration and shrank to bare
 * icons in the split view, so people couldn't tell what they did.
 */
export const emailActionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: theme.transitions.default,
};

export function setEmailActionHover(button: HTMLButtonElement, isHovered: boolean): void {
  button.style.backgroundColor = isHovered ? theme.colors.background.hover : theme.colors.background.paper;
}
