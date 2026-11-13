import React from 'react';
import { theme } from 'theme/theme';

/**
 * Centred card used by the stand-alone auth screens (verify email, check your
 * inbox). Full-height on its own page; `inline` drops the page background so
 * it can sit inside another layout such as the Login page column.
 */
export const AuthCard: React.FC<{ title: string; inline?: boolean; children: React.ReactNode }> = ({
  title,
  inline = false,
  children,
}) => {
  const card = (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        width: '100%',
        maxWidth: '400px',
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          color: theme.colors.text.primary,
          marginTop: 0,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        {title}
      </h1>
      {children}
    </div>
  );
  if (inline) {
    return card;
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.md,
        boxSizing: 'border-box',
      }}
    >
      {card}
    </div>
  );
};

export const authPrimaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: theme.spacing.md,
  backgroundColor: disabled ? theme.colors.border.medium : theme.colors.primary.main,
  color: theme.colors.background.paper,
  border: 'none',
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginBottom: theme.spacing.md,
});

export const authTextStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginTop: 0,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.base,
  lineHeight: 1.5,
};

export const authNoticeStyle = (isError: boolean): React.CSSProperties => {
  const color = isError ? theme.colors.accent.error : (theme.colors.accent.success ?? theme.colors.primary.main);
  return {
    backgroundColor: `${color}20`,
    color,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    fontSize: theme.typography.fontSize.sm,
  };
};

export const authLinkStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  color: theme.colors.primary.main,
  fontSize: theme.typography.fontSize.sm,
  textDecoration: 'none',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  padding: 0,
};
