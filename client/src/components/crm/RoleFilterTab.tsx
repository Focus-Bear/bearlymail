import React from 'react';
import { theme } from 'theme/theme';

import { STRING_POINTER } from 'constants/strings';
import { ContactThreadRoleFilter } from 'hooks/useContactThreads';

export interface RoleFilterTabProps {
  label: string;
  value: ContactThreadRoleFilter;
  active: boolean;
  onClick: (role: ContactThreadRoleFilter) => void;
}

export const RoleFilterTab: React.FC<RoleFilterTabProps> = ({ label, value, active, onClick }) => (
  <button
    onClick={() => onClick(value)}
    style={{
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      border: `1px solid ${active ? theme.colors.primary.main : theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: active ? theme.colors.primary.main : 'transparent',
      color: active ? '#fff' : theme.colors.text.secondary,
      cursor: STRING_POINTER,
      fontSize: theme.typography.fontSize.sm,
      fontWeight: active ? theme.typography.fontWeight.medium : theme.typography.fontWeight.normal,
    }}
  >
    {label}
  </button>
);

export default RoleFilterTab;
