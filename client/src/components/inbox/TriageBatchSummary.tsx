import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getTriageBandParts, getTriageBatchTotal } from 'components/inbox/triageBatchSummary.helpers';
import { PriorityCounts } from 'hooks/usePriorityCounts';

const SEPARATOR = ' · ';

interface TriageBatchSummaryProps {
  counts: PriorityCounts | null | undefined;
  /** Render only once the category accordions can render (mirrors the list's own guard). */
  isVisible: boolean;
}

/**
 * Compact one-line summary of the triage batch shown above the category accordions:
 * total emails to triage plus the distribution across priority bands, e.g.
 * "47 emails to triage · 12 High · 20 Medium · 15 Low".
 */
export const TriageBatchSummary: React.FC<TriageBatchSummaryProps> = ({ counts, isVisible }) => {
  const { t } = useTranslation();

  if (!isVisible || !counts) {
    return null;
  }

  const total = getTriageBatchTotal(counts);
  if (total === 0) {
    return null;
  }

  const bandParts = getTriageBandParts(counts).map(band =>
    t('inbox.batchSummary.band', { count: band.count, label: t(band.labelKey) })
  );

  return (
    <div
      data-testid="triage-batch-summary"
      style={{
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      }}
    >
      {[t('inbox.batchSummary.total', { count: total }), ...bandParts].join(SEPARATOR)}
    </div>
  );
};
