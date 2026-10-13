import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OpenTrackingSummary, RecentOpen } from 'types/email';
import { formatOpenTimestamp } from 'utils/openTracking';

import { COLOR_WHITE } from 'constants/colors';
import { OPEN_SOURCE_GMAIL_PROXY } from 'constants/openTracking';

interface OpenHistoryTooltipProps {
  id: string;
  summary: OpenTrackingSummary;
}

const OpenRow: React.FC<{ open: RecentOpen; locale: string }> = ({ open, locale }) => {
  const { t } = useTranslation();
  let sourceLabel: string | null = null;
  if (open.isLikelyAutomatic) {
    sourceLabel = t('openTracking.sourceAppleAutomatic');
  } else if (open.openSource === OPEN_SOURCE_GMAIL_PROXY) {
    sourceLabel = t('openTracking.sourceGmail');
  }
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', gap: theme.spacing.sm }}>
      <span>{formatOpenTimestamp(open.openedAt, locale)}</span>
      {sourceLabel && <span style={{ opacity: 0.75 }}>{sourceLabel}</span>}
    </li>
  );
};

/**
 * Open-history popover for the sent/opened indicator: when each open happened
 * (newest first), plus the caveats that keep the numbers honest.
 */
export const OpenHistoryTooltip: React.FC<OpenHistoryTooltipProps> = ({ id, summary }) => {
  const { t, i18n } = useTranslation();
  const opens = summary.recentOpens ?? [];
  const hasOpens = summary.openCount + summary.automaticOpenCount > 0;

  return (
    <span
      id={id}
      role="tooltip"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        // Indicators sit at the left of their header; open rightwards so the
        // card's overflow:hidden never clips the popover.
        left: 0,
        zIndex: 999,
        width: '260px',
        maxWidth: '80vw',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.text.primary,
        color: COLOR_WHITE,
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.normal,
        lineHeight: 1.5,
        textAlign: 'left',
        whiteSpace: 'normal',
        boxShadow: theme.shadows.md,
      }}
    >
      <strong style={{ display: 'block', marginBottom: theme.spacing.xs }}>
        {hasOpens ? t('openTracking.historyTitle') : t('openTracking.notOpenedYet')}
      </strong>
      <span style={{ display: 'block', opacity: 0.75 }}>
        {t('openTracking.sentAt', { time: formatOpenTimestamp(summary.sentAt, i18n.language) })}
      </span>
      {opens.length > 0 && (
        <ul style={{ listStyle: 'none', margin: `${theme.spacing.xs} 0 0`, padding: 0 }}>
          {opens.map(open => (
            <OpenRow key={`${open.openedAt}-${open.openSource}`} open={open} locale={i18n.language} />
          ))}
        </ul>
      )}
      {summary.automaticOpenCount > 0 && (
        <span style={{ display: 'block', marginTop: theme.spacing.xs, opacity: 0.85 }}>
          {t('openTracking.appleCaveat')}
        </span>
      )}
      {summary.recipientCount > 1 && (
        <span style={{ display: 'block', marginTop: theme.spacing.xs, opacity: 0.85 }}>
          {t('openTracking.multipleRecipients', { count: summary.recipientCount })}
        </span>
      )}
      <span style={{ display: 'block', marginTop: theme.spacing.xs, opacity: 0.6 }}>
        {t('openTracking.imagesCaveat')}
      </span>
    </span>
  );
};
