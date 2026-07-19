import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { STATUS_FAILED, STRING_NONE, STRING_TRANSPARENT } from 'constants/strings';

import { ContextAnalysisItem } from './ContextAnalysisSection.types';
import { formatDate, getStatusColor } from './contextAnalysisUtils';

interface AnalysisCardLeftInfoProps {
  analysis: ContextAnalysisItem;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders the left column of an analysis card header: user email, status badge,
 * correlation ID (with copy button), and creation timestamp.
 */
const AnalysisCardLeftInfo: React.FC<AnalysisCardLeftInfoProps> = ({ analysis, copiedId, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <span style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
          {analysis.userEmail}
        </span>
        <span
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: `${getStatusColor(analysis.status)}20`,
            color: getStatusColor(analysis.status),
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {analysis.status.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
        }}
      >
        <span>{t('admin.contextAnalysis.correlationId')}:</span>
        {analysis.correlationId ? (
          <button
            onClick={event => {
              event.stopPropagation();
              onCopy(analysis.correlationId!, analysis.id);
            }}
            style={{
              background: STRING_NONE,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
            }}
            title={t('admin.contextAnalysis.copyCorrelationId')}
          >
            {analysis.correlationId.slice(0, 8)}...{copiedId === analysis.id ? ' ✓' : ' 📋'}
          </button>
        ) : (
          <span style={{ fontStyle: 'italic' }}>{t('common.null')}</span>
        )}
        <span style={{ marginLeft: theme.spacing.sm }}>{formatDate(analysis.createdAt)}</span>
      </div>
    </div>
  );
};

interface AnalysisCardClickableHeaderProps {
  analysis: ContextAnalysisItem;
  isExpanded: boolean;
  canExpand: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onToggle: () => void;
}

/**
 * Clickable header row for an analysis card. Displays user info on the left
 * and batch/thread progress counters on the right. Toggles expanded content
 * when the card has failures or an error message.
 */
export const AnalysisCardClickableHeader: React.FC<AnalysisCardClickableHeaderProps> = ({
  analysis,
  isExpanded,
  canExpand,
  copiedId,
  onCopy,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: theme.spacing.md,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: canExpand ? 'pointer' : 'default',
        backgroundColor: analysis.status === STATUS_FAILED ? `${theme.colors.accent.error}10` : STRING_TRANSPARENT,
      }}
      onClick={onToggle}
    >
      <AnalysisCardLeftInfo analysis={analysis} copiedId={copiedId} onCopy={onCopy} />
      <div
        style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.lg, fontSize: theme.typography.fontSize.sm }}
      >
        {analysis.totalBatches > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.colors.text.secondary }}>{t('admin.contextAnalysis.batches')}</div>
            <div style={{ fontWeight: theme.typography.fontWeight.medium }}>
              {analysis.completedBatches}/{analysis.totalBatches}
              {analysis.failedBatches > 0 && (
                <span style={{ color: theme.colors.accent.error }}>
                  {' '}
                  ({analysis.failedBatches} {t('admin.contextAnalysis.failed')})
                </span>
              )}
            </div>
          </div>
        )}
        {analysis.threadCount !== null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.colors.text.secondary }}>{t('admin.contextAnalysis.threads')}</div>
            <div style={{ fontWeight: theme.typography.fontWeight.medium }}>
              {analysis.analyzedCount || 0}/{analysis.threadCount}
            </div>
          </div>
        )}
        {canExpand && (
          <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.lg }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>
    </div>
  );
};
