import React from 'react';
import { theme } from 'theme/theme';

interface AccordionGroupProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  headerColor?: string;
  children: React.ReactNode;
}

export const AccordionGroup: React.FC<AccordionGroupProps> = ({
  title,
  count,
  defaultOpen = false,
  headerColor,
  children,
}) => (
  <details open={defaultOpen} style={{ marginBottom: theme.spacing.sm }}>
    <summary
      style={{
        cursor: 'pointer',
        fontWeight: 'bold',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: headerColor ?? theme.colors.background.subtle,
        borderRadius: theme.borderRadius.sm,
        marginBottom: theme.spacing.xs,
        userSelect: 'none',
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
      }}
    >
      {title} ({count})
    </summary>
    <div style={{ paddingLeft: theme.spacing.md }}>{children}</div>
  </details>
);
