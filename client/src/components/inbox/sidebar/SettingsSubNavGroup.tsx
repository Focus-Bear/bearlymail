import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface SettingsSubNavItem {
  id: string;
  label: string;
  anchor: string;
}

interface SettingsSubNavGroupProps {
  label: string;
  items: SettingsSubNavItem[];
  isExpanded: boolean;
  hash?: string;
  onToggle: () => void;
  onScrollToSection: (anchor: string) => void;
}

export const SettingsSubNavGroup: React.FC<SettingsSubNavGroupProps> = ({
  label,
  items,
  isExpanded,
  hash,
  onToggle,
  onScrollToSection,
}) => {
  return (
    <div style={{ marginBottom: theme.spacing.xs }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: theme.typography.fontSize.sm }}>{isExpanded ? '▼' : '▶'}</span>
      </button>
      {isExpanded && (
        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
          {items.map(subItem => (
            <button
              key={subItem.id}
              onClick={() => onScrollToSection(subItem.anchor)}
              style={{
                width: '100%',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: hash === `#${subItem.anchor}` ? theme.colors.primary.subtle : 'transparent',
                color: hash === `#${subItem.anchor}` ? theme.colors.primary.main : theme.colors.text.tertiary,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                textAlign: 'left',
              }}
            >
              {subItem.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
