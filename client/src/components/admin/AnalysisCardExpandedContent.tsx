import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_WHITE } from 'constants/colors';

import { ContextAnalysisItem, FailureDetail } from './ContextAnalysisSection.types';
import { formatDate, getErrorTypeColor } from './contextAnalysisUtils';
import { FailureDetailCorrelationRow } from './FailureDetailCorrelationRow';

interface FailureDetailItemProps {
  failure: FailureDetail;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders a single batch failure entry, showing error type badge, timestamp,
 * error message, and an optional correlation ID row for PostHog tracing.
 */
const FailureDetailItem: React.FC<FailureDetailItemProps> = ({ failure, copiedId, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.xs,
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
            {t('admin.contextAnalysis.batch')} #{failure.batchIndex + 1}
          </span>
          {failure.errorType && (
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.semibold,
                color: COLOR_WHITE,
                backgroundColor: getErrorTypeColor(failure.errorType),
                borderRadius: theme.borderRadius.sm,
                padding: `2px ${theme.spacing.xs}`,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(`admin.contextAnalysis.errorType.${failure.errorType}`, { defaultValue: failure.errorType })}
            </span>
          )}
        </div>
        {failure.failedAt && (
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
            {formatDate(failure.failedAt)}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.accent.error,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          marginBottom: failure.correlationId ? theme.spacing.sm : undefined,
        }}
      >
        {failure.error}
      </div>
      {failure.correlationId && (
        <FailureDetailCorrelationRow
          correlationId={failure.correlationId}
          batchIndex={failure.batchIndex}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      )}
    </div>
  );
};

interface AnalysisCardExpandedContentProps {
  analysis: ContextAnalysisItem;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders the expanded section of an analysis card, showing the top-level error
 * message (if any), a list of per-batch failures, and IDs for debugging.
 */
export const AnalysisCardExpandedContent: React.FC<AnalysisCardExpandedContentProps> = ({
  analysis,
  copiedId,
  onCopy,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        borderTop: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      {analysis.errorMessage && (
        <div
          style={{
            marginBottom: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: `${theme.colors.accent.error}10`,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.accent.error}30`,
          }}
        >
          <div
            style={{
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.accent.error,
              marginBottom: theme.spacing.xs,
            }}
          >
            {t('admin.contextAnalysis.errorMessage')}
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {analysis.errorMessage}
          </div>
        </div>
      )}
      {analysis.failureDetails.length > 0 && (
        <div>
          <div
            style={{
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('admin.contextAnalysis.batchFailures')} ({analysis.failureDetails.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {analysis.failureDetails.map(failure => (
              <FailureDetailItem key={failure.batchIndex} failure={failure} copiedId={copiedId} onCopy={onCopy} />
            ))}
          </div>
        </div>
      )}
      <div
        style={{
          marginTop: theme.spacing.md,
          paddingTop: theme.spacing.md,
          borderTop: `1px solid ${theme.colors.border.light}`,
          display: 'flex',
          gap: theme.spacing.lg,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
        }}
      >
        <span>
          <strong>{t('admin.contextAnalysis.analysisId')}:</strong>{' '}
          <code style={{ userSelect: 'all' }}>{analysis.id}</code>
        </span>
        <span>
          <strong>{t('admin.contextAnalysis.userId')}:</strong>{' '}
          <code style={{ userSelect: 'all' }}>{analysis.userId}</code>
        </span>
      </div>
    </div>
  );
};
