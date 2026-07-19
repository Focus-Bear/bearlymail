import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Table header component for comparison table
 */
export const ComparisonTableHeader: React.FC = () => {
  const { t } = useTranslation();
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
          {t('landing.comparison.table.bearlyMail')}
        </th>
        <th style={{ ...cellStyle, textAlign: 'center', color: theme.colors.text.secondary }}>
          {t('landing.comparison.table.superhuman')}
        </th>
        <th style={{ ...cellStyle, textAlign: 'center', color: theme.colors.text.secondary }}>
          {t('landing.comparison.table.gmail')}
        </th>
      </tr>
    </thead>
  );
};
