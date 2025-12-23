import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';

/**
 * Table header component for comparison table
 */
export const ComparisonTableHeader: React.FC = () => {
  const { isMobile } = useResponsiveBreakpoints();

  const cellStyle: React.CSSProperties = {
    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
    fontWeight: theme.typography.fontWeight.bold,
    borderBottom: `2px solid ${theme.colors.border.medium}`,
    fontSize: theme.typography.fontSize.base,
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  };

  return (
    <thead>
      <tr style={{ backgroundColor: theme.colors.background.subtle }}>
        <th style={{ ...cellStyle, textAlign: 'left', color: theme.colors.text.primary }}></th>
        <th style={{ ...cellStyle, textAlign: 'center', color: theme.colors.primary.main }}>
          BearlyMail
        </th>
        <th style={{ ...cellStyle, textAlign: 'center', color: theme.colors.text.secondary }}>
          Superhuman
        </th>
        <th style={{ ...cellStyle, textAlign: 'center', color: theme.colors.text.secondary }}>
          Gmail Priority
        </th>
      </tr>
    </thead>
  );
};



