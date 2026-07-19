import React from 'react';
import { theme } from 'theme/theme';

import { ROUTE_SETTINGS, STRING_BLOCK, STRING_NONE } from 'constants/strings';

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
    <a
      href={`${ROUTE_SETTINGS}#${anchor}`}
      onClick={event => {
        event.preventDefault();
        onScrollToSection(anchor);
      }}
      style={{
        display: STRING_BLOCK,
        width: '100%',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: isActive ? theme.colors.primary.subtle : 'transparent',
        color: isActive ? theme.colors.primary.main : theme.colors.text.tertiary,
        borderRadius: theme.borderRadius.sm,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
        textAlign: 'left',
        textDecoration: STRING_NONE,
      }}
    >
      {label}
    </a>
  );
};
