import React from 'react';
import { theme } from 'theme/theme';

import { ComparisonTableHeader } from 'components/landing/ComparisonTableHeader';
import { ComparisonTableRow } from 'components/landing/ComparisonTableRow';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface ComparisonRow {
  label: string;
  bearlyMail: string;
  superhuman: string;
  gmail: string;
}

interface ComparisonTableProps {
  rows: ComparisonRow[];
}

/**
 * Comparison table component
 * Displays a comparison between BearlyMail, Superhuman, and Gmail Priority
 */
export const ComparisonTable: React.FC<ComparisonTableProps> = ({ rows }) => {
  const { isMobile } = useResponsiveBreakpoints();

  const containerStyle: React.CSSProperties = {
    overflowX: 'auto',
    marginBottom: isMobile ? theme.spacing.md : theme.spacing.xl,
    WebkitOverflowScrolling: 'touch',
    marginLeft: isMobile ? `-${theme.spacing.md}` : 0,
    marginRight: isMobile ? `-${theme.spacing.md}` : 0,
    paddingLeft: isMobile ? theme.spacing.md : 0,
    paddingRight: isMobile ? theme.spacing.md : 0,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: isMobile ? '500px' : 'auto',
    borderCollapse: 'collapse',
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  };

  return (
    <div style={containerStyle}>
      <table style={tableStyle}>
        <ComparisonTableHeader />
        <tbody>
          {rows.map((row, index) => (
            <ComparisonTableRow
              key={`row-${row.label.toLowerCase().replace(/\s+/g, '-')}`}
              row={row}
              isLastRow={index === rows.length - 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
