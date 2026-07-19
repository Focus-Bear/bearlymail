import React from 'react';
import { theme } from 'theme/theme';

interface CalendarModalHeaderProps {
  title: string;
  onClose: () => void;
}

export const CalendarModalHeader: React.FC<CalendarModalHeaderProps> = ({ title, onClose }) => {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}
    >
      <h2
        style={{
          margin: 0,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        {title}
      </h2>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xl,
          padding: theme.spacing.xs,
        }}
      >
        ×
      </button>
    </div>
  );
};
