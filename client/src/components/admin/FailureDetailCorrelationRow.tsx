import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { STRING_NONE } from 'constants/strings';

interface FailureDetailCorrelationRowProps {
  correlationId: string;
  batchIndex: number;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders a correlation ID row within a batch failure detail, providing a
 * copy-to-clipboard button and a direct link to the event in PostHog.
 */
export const FailureDetailCorrelationRow: React.FC<FailureDetailCorrelationRowProps> = ({
  correlationId,
  batchIndex,
  copiedId,
  onCopy,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
        marginTop: theme.spacing.xs,
      }}
    >
      <span
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('admin.contextAnalysis.batchCorrelationId')}:
      </span>
      <button
        onClick={() => onCopy(correlationId, `batch-${batchIndex}`)}
        title={t('admin.contextAnalysis.copyCorrelationId')}
        style={{
          background: STRING_NONE,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.sm,
          padding: `2px ${theme.spacing.xs}`,
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.primary,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {copiedId === `batch-${batchIndex}` ? '✓' : '📋'} {correlationId.slice(0, 8)}...
      </button>
      <a
        href={`https://app.posthog.com/events?properties=[{"key":"correlationId","value":"${correlationId}","operator":"exact"}]`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.accent.info, textDecoration: 'none' }}
      >
        {t('admin.contextAnalysis.viewInPosthog')} ↗
      </a>
    </div>
  );
};
