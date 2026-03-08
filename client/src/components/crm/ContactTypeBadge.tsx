import React from 'react';
import { theme } from 'theme/theme';

import { STRING_SM } from 'constants/strings';

interface ContactTypeBadgeProps {
  label: string;
  color: string | null;
  icon?: string | null;
  size?: 'sm' | 'md';
}

export const ContactTypeBadge: React.FC<ContactTypeBadgeProps> = ({ label, color, icon, size = STRING_SM }) => {
  const badgeColor = color || '#6B7280';
  const fontSize = size === STRING_SM ? theme.typography.fontSize.xs : theme.typography.fontSize.sm;
  const padding = size === STRING_SM ? `1px ${theme.spacing.xs}` : `2px ${theme.spacing.sm}`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding,
        backgroundColor: `${badgeColor}18`,
        color: badgeColor,
        border: `1px solid ${badgeColor}40`,
        borderRadius: theme.borderRadius.sm,
        fontSize,
        fontWeight: theme.typography.fontWeight.medium,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {icon && <span style={{ fontSize }}>{icon}</span>}
      {label}
    </span>
  );
};
