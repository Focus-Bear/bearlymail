import React from 'react';
import { theme } from 'theme/theme';

interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
}

export const SchedulePreset: React.FC<Props> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      borderRadius: theme.borderRadius.sm,
      border: `1px solid ${active ? theme.colors.primary.main : theme.colors.border.medium}`,
      backgroundColor: active ? theme.colors.primary.main : 'transparent',
      color: active ? 'white' : theme.colors.text.secondary,
      fontSize: theme.typography.fontSize.sm,
      fontWeight: theme.typography.fontWeight.medium,
      cursor: 'pointer',
      minWidth: '44px',
    }}
  >
    {label}
  </button>
);

export default SchedulePreset;
