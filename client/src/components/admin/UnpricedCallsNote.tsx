import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { formatNumber } from './tokenUsageUtils';

interface UnpricedCallsNoteProps {
  /** Calls on models with no pricing entry; excluded from the cost shown above. */
  unpricedCallCount?: number;
}

/**
 * Flags that an estimated cost is a lower bound because some calls ran on
 * models with no known price, so they aren't silently counted as $0.
 */
export const UnpricedCallsNote: React.FC<UnpricedCallsNoteProps> = ({ unpricedCallCount }) => {
  const { t } = useTranslation();
  if (!unpricedCallCount) {
    return null;
  }
  const translationOptions = { count: unpricedCallCount, formattedCount: formatNumber(unpricedCallCount) };
  return (
    <div
      title={t('admin.tokenUsage.unpricedCallsHint', translationOptions)}
      style={{
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.normal,
        color: theme.colors.accent.warning,
      }}
    >
      {t('admin.tokenUsage.unpricedCalls', translationOptions)}
    </div>
  );
};
