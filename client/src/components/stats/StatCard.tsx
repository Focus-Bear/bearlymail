import React from 'react';
import { theme } from 'theme/theme';

/** A single headline number with its label (and optional subtext) on the Stats page. */
export const StatCard: React.FC<{
  label: string;
  value: string;
  subtext?: string;
}> = ({ label, value, subtext }) => (
  <div
    style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      border: `1px solid ${theme.colors.border.light}`,
      textAlign: 'center',
      flex: '1 1 180px',
    }}
  >
    <div
      style={{
        ...theme.typography.heading.h3,
        color: theme.colors.primary.main,
      }}
    >
      {value}
    </div>
    <div
      style={{
        ...theme.typography.body.large,
        color: theme.colors.text.secondary,
        marginTop: theme.spacing.xs,
      }}
    >
      {label}
    </div>
    {subtext && (
      <div
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        {subtext}
      </div>
    )}
  </div>
);
