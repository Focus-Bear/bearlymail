import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import axios from 'axios';

import { API_URL } from 'config/api';

interface UsageByOperation {
  operation: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

type DateRange = '24h' | '7d' | '30d' | 'all';

const REFRESH_INTERVAL_MS = 30000;

const OPERATION_LABELS: Record<string, string> = {
  analyze_email_patterns: 'Analyze Email Patterns',
  summarize_email: 'Summarize Email',
  check_tone: 'Check Tone',
  extract_action_items: 'Extract Action Items',
  suggest_actions: 'Suggest Actions',
  generate_reply: 'Generate Reply',
  generate_reply_options: 'Generate Reply Options',
  generate_meeting_reply: 'Generate Meeting Reply',
  generate_follow_up: 'Generate Follow-up',
  analyze_override_reason: 'Analyze Override Reason',
  extract_qanda: 'Extract Q&A',
  search_relevance: 'Search Relevance',
  search_relevance_batch: 'Search Relevance (Batch)',
  analyze_priority: 'Analyze Priority',
  unknown: 'Unknown Operation',
};

export const TokenUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<UsageByOperation[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  const getDateRangeParams = (): { startDate?: string } => {
    const now = new Date();
    switch (dateRange) {
      case '24h':
        return { startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() };
      case '7d':
        return { startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() };
      case '30d':
        return { startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() };
      case 'all':
      default:
        return {};
    }
  };

  const fetchUsageData = async () => {
    try {
      const params = getDateRangeParams();
      const [usageResponse, summaryResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/token-usage`, { params }),
        axios.get(`${API_URL}/admin/token-usage/summary`, { params }),
      ]);
      setUsage(usageResponse.data.usage);
      setSummary(summaryResponse.data.summary);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Error fetching token usage:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();

    const interval = setInterval(() => {
      fetchUsageData();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [dateRange]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  const formatDuration = (ms: number | null): string => {
    if (ms === null || ms === undefined) {
      return t('admin.tokenUsage.noData');
    }

    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60000;

    if (ms < MS_PER_SECOND) {
      return `${Math.round(ms)}ms`;
    }

    if (ms < MS_PER_MINUTE) {
      return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
    }

    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return `${minutes}m ${seconds}s`;
  };

  const getOperationLabel = (operation: string): string => {
    return OPERATION_LABELS[operation] || operation;
  };

  const renderSummaryCards = () => {
    if (!summary) return null;

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl,
      }}>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.totalCalls')}
          </div>
          <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
            {formatNumber(summary.totalCalls)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.totalTokens')}
          </div>
          <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
            {formatNumber(summary.totalTokens)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.promptTokens')}
          </div>
          <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
            {formatNumber(summary.totalPromptTokens)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.completionTokens')}
          </div>
          <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
            {formatNumber(summary.totalCompletionTokens)}
          </div>
        </div>
      </div>
    );
  };

  const renderDateFilter = () => (
    <div style={{
      display: 'flex',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    }}>
      {(['24h', '7d', '30d', 'all'] as DateRange[]).map((range) => (
        <button
          key={range}
          onClick={() => setDateRange(range)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: dateRange === range ? theme.colors.primary.main : theme.colors.background.paper,
            color: dateRange === range ? theme.colors.primary.contrastText : theme.colors.text.primary,
            border: `1px solid ${dateRange === range ? theme.colors.primary.main : theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t(`admin.tokenUsage.range.${range}`)}
        </button>
      ))}
    </div>
  );

  const renderTableHeader = () => (
    <thead>
      <tr style={{
        backgroundColor: theme.colors.background.default,
        borderBottom: `2px solid ${theme.colors.border.medium}`,
      }}>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'left',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.tokenUsage.operation')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.tokenUsage.calls')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.tokenUsage.promptTokens')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.tokenUsage.completionTokens')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.tokenUsage.totalTokens')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {t('admin.tokenUsage.avgDuration')}
        </th>
      </tr>
    </thead>
  );

  const renderTableBody = () => {
    if (usage.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={6} style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
            }}>
              {t('admin.tokenUsage.noUsage')}
            </td>
          </tr>
        </tbody>
      );
    }

    return (
      <tbody>
        {usage.map((item, index) => (
          <tr
            key={item.operation}
            style={{
              backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
              borderBottom: `1px solid ${theme.colors.border.light}`,
            }}
          >
            <td style={{
              padding: theme.spacing.md,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {getOperationLabel(item.operation)}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: theme.colors.text.primary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {formatNumber(item.callCount)}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {formatNumber(item.totalPromptTokens)}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {formatNumber(item.totalCompletionTokens)}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {formatNumber(item.totalTokens)}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: theme.colors.text.primary,
            }}>
              {formatDuration(item.avgDurationMs)}
            </td>
          </tr>
        ))}
      </tbody>
    );
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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
      }}>
        <h2 style={{
          margin: 0,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}>
          {t('admin.tokenUsage.title')}
        </h2>
        {lastUpdated && (
          <div style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}>
            {t('admin.tokenUsage.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {renderDateFilter()}
      {renderSummaryCards()}

      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border.light}`,
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          {renderTableHeader()}
          {renderTableBody()}
        </table>
      </div>
    </div>
  );
};
