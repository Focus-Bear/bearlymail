import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface SettingsSubNavItemProps {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

/** One Settings tab in the sidebar, under "Settings" (#482). */
export const SettingsSubNavItem: React.FC<SettingsSubNavItemProps> = ({ label, isActive, onSelect }) => (
  <button
    type="button"
    aria-current={isActive ? 'page' : undefined}
    onClick={onSelect}
    style={{
      display: 'block',
      width: '100%',
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      marginBottom: theme.spacing.xs,
      border: STRING_NONE,
      backgroundColor: isActive ? theme.colors.primary.subtle : COLOR_TRANSPARENT,
      color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
      borderRadius: theme.borderRadius.sm,
      cursor: 'pointer',
      fontSize: theme.typography.fontSize.sm,
      fontWeight: isActive ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
      textAlign: 'left',
    }}
  >
    {label}
  </button>
);
