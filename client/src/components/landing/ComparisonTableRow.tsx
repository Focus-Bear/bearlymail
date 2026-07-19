import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface ComparisonRow {
  label: string;
  bearlyMail: string;
  superhuman: string;
  gmail: string;
}

interface ComparisonTableRowProps {
  row: ComparisonRow;
  isLastRow: boolean;
}

/**
 * Table row component for comparison table
 */
export const ComparisonTableRow: React.FC<ComparisonTableRowProps> = ({ row, isLastRow }) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();

  const baseCellStyle: React.CSSProperties = {
    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
    borderBottom: !isLastRow ? `1px solid ${theme.colors.border.light}` : 'none',
    fontSize: theme.typography.fontSize.base,
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  };

  const labelCellStyle: React.CSSProperties = {
    ...baseCellStyle,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  };

  const dataCellStyle: React.CSSProperties = {
    ...baseCellStyle,
    textAlign: 'center',
    color: theme.colors.text.secondary,
  };

  const bearlyMailCellStyle: React.CSSProperties = {
    ...dataCellStyle,
    fontWeight:
      row.label === t('landing.comparison.table.rows.philosophy.label')
        ? theme.typography.fontWeight.medium
        : undefined,
  };

  const rowKey = `row-${row.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <tr key={rowKey}>
      <td style={labelCellStyle}>{row.label}</td>
      <td style={bearlyMailCellStyle}>{row.bearlyMail}</td>
      <td style={dataCellStyle}>{row.superhuman}</td>
      <td style={dataCellStyle}>{row.gmail}</td>
    </tr>
  );
};
