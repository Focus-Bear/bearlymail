import React from 'react';
import { theme } from 'theme/theme';

interface SettingsSubNavItemProps {
  id: string;
  label: string;
  anchor: string;
  hash?: string;
  onScrollToSection: (anchor: string) => void;
}

export const SettingsSubNavItem: React.FC<SettingsSubNavItemProps> = ({
  id,
  label,
  anchor,
  hash,
  onScrollToSection,
}) => {
  const isActive = hash === `#${anchor}`;

  return (
    <button
      onClick={() => onScrollToSection(anchor)}
      style={{
        width: '100%',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: isActive ? theme.colors.primary.subtle : 'transparent',
        color: isActive ? theme.colors.primary.main : theme.colors.text.tertiary,
        border: 'none',
        borderRadius: theme.borderRadius.sm,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
};






