import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_WHITE } from 'constants/colors';
import { ERROR_TYPE_NETWORK_ERROR, ERROR_TYPE_PARSE_ERROR, ERROR_TYPE_RATE_LIMIT, ERROR_TYPE_TIMEOUT, ERROR_TYPE_TOKEN_LIMIT, FILTER_ALL, STATUS_COMPLETED, STATUS_FAILED, STATUS_PENDING, STATUS_RUNNING, STRING_NONE, STRING_TRANSPARENT } from 'constants/strings';

interface FailureDetail {
  batchIndex: number;
  error: string;
  failedAt: string | null;
  correlationId: string | null;
  errorType: string | null;
}

interface ContextAnalysisItem {
  id: string;
  correlationId: string | null;
  userId: string;
  userEmail: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage: string | null;
  progress: number | null;
  threadCount: number | null;
  analyzedCount: number | null;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  failureDetails: FailureDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ContextAnalysisResponse {
  analyses: ContextAnalysisItem[];
  timestamp: string;
}

type StatusFilter = 'all' | 'failed' | 'running' | 'completed' | 'pending';

const COPY_FEEDBACK_DURATION_MS = 2000;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case STATUS_FAILED: return theme.colors.accent.error;
    case STATUS_RUNNING: return theme.colors.accent.info;
    case STATUS_COMPLETED: return theme.colors.accent.success;
    case STATUS_PENDING: return theme.colors.accent.warning;
    default: return theme.colors.text.secondary;
  }
}

function getErrorTypeColor(errorType: string | null): string {
  switch (errorType) {
    case ERROR_TYPE_RATE_LIMIT: return theme.colors.accent.error;
    case ERROR_TYPE_TIMEOUT: return theme.colors.accent.warning;
    case ERROR_TYPE_TOKEN_LIMIT: return theme.colors.accent.warning;
    case ERROR_TYPE_PARSE_ERROR: return theme.colors.accent.info;
    case ERROR_TYPE_NETWORK_ERROR: return theme.colors.accent.error;
    default: return theme.colors.text.secondary;
  }
}

interface AnalysisFilterBarProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  lastUpdated: Date | null;
}

const AnalysisFilterBar: React.FC<AnalysisFilterBarProps> = ({ statusFilter, onStatusFilterChange, lastUpdated }) => {
  const { t } = useTranslation();
  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('admin.contextAnalysis.filter.all') },
    { value: 'failed', label: t('admin.contextAnalysis.filter.failed') },
    { value: 'running', label: t('admin.contextAnalysis.filter.running') },
    { value: 'completed', label: t('admin.contextAnalysis.filter.completed') },
    { value: 'pending', label: t('admin.contextAnalysis.filter.pending') },
  ];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
      <h2 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
        {t('admin.contextAnalysis.title')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
          style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.medium}`, backgroundColor: theme.colors.background.paper, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm, cursor: 'pointer' }}
        >
          {statusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {lastUpdated && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.jobs.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

interface FailureDetailItemProps {
  failure: FailureDetail;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

const FailureDetailItem: React.FC<FailureDetailItemProps> = ({ failure, copiedId, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: theme.spacing.sm, backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.sm, border: `1px solid ${theme.colors.border.light}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.xs, flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
            {t('admin.contextAnalysis.batch')} #{failure.batchIndex + 1}
          </span>
          {failure.errorType && (
            <span style={{ fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.semibold, color: COLOR_WHITE, backgroundColor: getErrorTypeColor(failure.errorType), borderRadius: theme.borderRadius.sm, padding: `2px ${theme.spacing.xs}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
      <div style={{ fontFamily: 'monospace', fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: failure.correlationId ? theme.spacing.sm : undefined }}>
        {failure.error}
      </div>
      {failure.correlationId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap', marginTop: theme.spacing.xs }}>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, fontWeight: theme.typography.fontWeight.medium }}>
            {t('admin.contextAnalysis.batchCorrelationId')}:
          </span>
          <button
            onClick={() => onCopy(failure.correlationId!, `batch-${failure.batchIndex}`)}
            title={t('admin.contextAnalysis.copyCorrelationId')}
            style={{ background: STRING_NONE, border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.borderRadius.sm, padding: `2px ${theme.spacing.xs}`, cursor: 'pointer', fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.primary, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {copiedId === `batch-${failure.batchIndex}` ? '✓' : '📋'}{' '}
            {failure.correlationId.slice(0, 8)}...
          </button>
          <a
            href={`https://app.posthog.com/events?properties=[{"key":"correlationId","value":"${failure.correlationId}","operator":"exact"}]`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.accent.info, textDecoration: 'none' }}
          >
            {t('admin.contextAnalysis.viewInPosthog')} ↗
          </a>
        </div>
      )}
    </div>
  );
};

interface AnalysisCardProps {
  analysis: ContextAnalysisItem;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis, expandedId, setExpandedId, copiedId, onCopy }) => {
  const { t } = useTranslation();
  const isExpanded = expandedId === analysis.id;
  const canExpand = analysis.failedBatches > 0 || !!analysis.errorMessage;
  return (
    <div style={{ backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, border: `1px solid ${analysis.status === STATUS_FAILED ? theme.colors.accent.error : theme.colors.border.light}`, overflow: 'hidden' }}>
      <div
        style={{ padding: theme.spacing.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: canExpand ? 'pointer' : 'default', backgroundColor: analysis.status === STATUS_FAILED ? `${theme.colors.accent.error}10` : STRING_TRANSPARENT }}
        onClick={() => { if (canExpand) setExpandedId(isExpanded ? null : analysis.id); }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
            <span style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>{analysis.userEmail}</span>
            <span style={{ padding: `${theme.spacing.xs} ${theme.spacing.sm}`, borderRadius: theme.borderRadius.sm, backgroundColor: `${getStatusColor(analysis.status)}20`, color: getStatusColor(analysis.status), fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.medium }}>
              {analysis.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            <span>{t('admin.contextAnalysis.correlationId')}:</span>
            {analysis.correlationId ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(analysis.correlationId!, analysis.id); }}
                style={{ background: STRING_NONE, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.sm, padding: `${theme.spacing.xs} ${theme.spacing.sm}`, cursor: 'pointer', fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.primary, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.lg, fontSize: theme.typography.fontSize.sm }}>
          {analysis.totalBatches > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: theme.colors.text.secondary }}>{t('admin.contextAnalysis.batches')}</div>
              <div style={{ fontWeight: theme.typography.fontWeight.medium }}>
                {analysis.completedBatches}/{analysis.totalBatches}
                {analysis.failedBatches > 0 && <span style={{ color: theme.colors.accent.error }}>{' '}({analysis.failedBatches} {t('admin.contextAnalysis.failed')})</span>}
              </div>
            </div>
          )}
          {analysis.threadCount !== null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: theme.colors.text.secondary }}>{t('admin.contextAnalysis.threads')}</div>
              <div style={{ fontWeight: theme.typography.fontWeight.medium }}>{analysis.analyzedCount || 0}/{analysis.threadCount}</div>
            </div>
          )}
          {canExpand && <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.lg }}>{isExpanded ? '▼' : '▶'}</span>}
        </div>
      </div>
      {isExpanded && (
        <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, padding: theme.spacing.md, backgroundColor: theme.colors.background.default }}>
          {analysis.errorMessage && (
            <div style={{ marginBottom: theme.spacing.md, padding: theme.spacing.md, backgroundColor: `${theme.colors.accent.error}10`, borderRadius: theme.borderRadius.sm, border: `1px solid ${theme.colors.accent.error}30` }}>
              <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.accent.error, marginBottom: theme.spacing.xs }}>{t('admin.contextAnalysis.errorMessage')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{analysis.errorMessage}</div>
            </div>
          )}
          {analysis.failureDetails.length > 0 && (
            <div>
              <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
                {t('admin.contextAnalysis.batchFailures')} ({analysis.failureDetails.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {analysis.failureDetails.map((failure) => (
                  <FailureDetailItem key={failure.batchIndex} failure={failure} copiedId={copiedId} onCopy={onCopy} />
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, display: 'flex', gap: theme.spacing.lg, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
            <span><strong>{t('admin.contextAnalysis.analysisId')}:</strong>{' '}<code style={{ userSelect: 'all' }}>{analysis.id}</code></span>
            <span><strong>{t('admin.contextAnalysis.userId')}:</strong>{' '}<code style={{ userSelect: 'all' }}>{analysis.userId}</code></span>
          </div>
        </div>
      )}
    </div>
  );
};

export const ContextAnalysisSection: React.FC = () => {
  const { t } = useTranslation();
  const [analyses, setAnalyses] = useState<ContextAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('failed');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (statusFilter !== FILTER_ALL) {
        params.status = statusFilter;
      }
      const response = await axios.get<ContextAnalysisResponse>(`${API_URL}/context/admin/analyses`, {
        params,
      });
      setAnalyses(response.data.analyses);
      setLastUpdated(new Date(response.data.timestamp));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching context analyses:', error);
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;
    const REFRESH_INTERVAL_MS = 15000;

    const poll = async () => {
      await fetchAnalyses();
      if (isMounted) {
        timeoutId = setTimeout(poll, REFRESH_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchAnalyses]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
        {t('admin.dashboard.loading')}
      </div>
    );
  }

  return (
    <div>
      <AnalysisFilterBar statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} lastUpdated={lastUpdated} />

      <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.lg }}>
        {t('admin.contextAnalysis.description')}
      </p>

      {analyses.length === 0 ? (
        <div style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary, backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}` }}>
          {t('admin.contextAnalysis.noAnalyses')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {analyses.map((analysis) => (
            <AnalysisCard key={analysis.id} analysis={analysis} expandedId={expandedId} setExpandedId={setExpandedId} copiedId={copiedId} onCopy={copyToClipboard} />
          ))}
        </div>
      )}
    </div>
  );
};
