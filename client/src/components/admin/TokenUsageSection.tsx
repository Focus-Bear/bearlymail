import React, { useCallback,useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { DAYS_IN_MONTH_30, MS_PER_DAY,NUMBER_FORMAT_MILLION, NUMBER_FORMAT_THOUSAND, OPACITY_DISABLED_ALT, REFRESH_INTERVAL_30_SEC_MS } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface UsageByOperation {
  operation: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
  htmlCallCount: number;
}

interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

interface PromptExample {
  operation: string;
  promptTokens: number;
  promptText: string;
  systemPromptText?: string;
  containsHtml: boolean;
  capturedAt: string;
  provider: string;
  model: string;
}

type DateRange = '24h' | '7d' | '30d' | 'all';

const DATE_RANGE_24H: DateRange = '24h';
const DATE_RANGE_7D: DateRange = '7d';
const DATE_RANGE_30D: DateRange = '30d';
const DATE_RANGE_ALL: DateRange = 'all';

const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_30_SEC_MS;

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

const formatNumber = (value: number): string => {
  if (value >= NUMBER_FORMAT_MILLION) {
    return `${(value / NUMBER_FORMAT_MILLION).toFixed(2)}M`;
  }
  if (value >= NUMBER_FORMAT_THOUSAND) {
    return `${(value / NUMBER_FORMAT_THOUSAND).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

const formatDuration = (ms: number | null, noDataLabel: string): string => {
  if (ms === null || ms === undefined) {
    return noDataLabel;
  }
  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60000;
  if (ms < MS_PER_SECOND) return `${Math.round(ms)}ms`;
  if (ms < MS_PER_MINUTE) return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  return `${minutes}m ${seconds}s`;
};

const getOperationLabel = (operation: string): string => OPERATION_LABELS[operation] || operation;

// --- Sub-components ---

interface SummaryCardsProps {
  summary: UsageSummary;
}

const TokenSummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => {
  const { t } = useTranslation();
  const cardStyle = {
    backgroundColor: theme.colors.background.paper,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border.light}`,
  };
  const labelStyle = { fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary };
  const valueStyle = { fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
      <div style={cardStyle}><div style={labelStyle}>{t('admin.tokenUsage.totalCalls')}</div><div style={valueStyle}>{formatNumber(summary.totalCalls)}</div></div>
      <div style={cardStyle}><div style={labelStyle}>{t('admin.tokenUsage.totalTokens')}</div><div style={valueStyle}>{formatNumber(summary.totalTokens)}</div></div>
      <div style={cardStyle}><div style={labelStyle}>{t('admin.tokenUsage.promptTokens')}</div><div style={valueStyle}>{formatNumber(summary.totalPromptTokens)}</div></div>
      <div style={cardStyle}><div style={labelStyle}>{t('admin.tokenUsage.completionTokens')}</div><div style={valueStyle}>{formatNumber(summary.totalCompletionTokens)}</div></div>
    </div>
  );
};

interface DateFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const TokenDateFilter: React.FC<DateFilterProps> = ({ dateRange, onDateRangeChange }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
      {(['24h', '7d', '30d', 'all'] as DateRange[]).map((range) => (
        <button
          key={range}
          onClick={() => onDateRangeChange(range)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: dateRange === range ? theme.colors.primary.main : theme.colors.background.paper,
            color: dateRange === range ? 'white' : theme.colors.text.primary,
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
};

interface UsageTableProps {
  usage: UsageByOperation[];
  noDataLabel: string;
}

const TokenUsageTable: React.FC<UsageTableProps> = ({ usage, noDataLabel }) => {
  const { t } = useTranslation();
  const thStyle = { padding: theme.spacing.md, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, borderRight: `1px solid ${theme.colors.border.light}` };
  return (
    <div style={{ backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, overflow: 'hidden', border: `1px solid ${theme.colors.border.light}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: theme.colors.background.default, borderBottom: `2px solid ${theme.colors.border.medium}` }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>{t('admin.tokenUsage.operation')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.calls')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.promptTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.completionTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.totalTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.htmlCalls')}</th>
            <th style={{ padding: theme.spacing.md, textAlign: 'center', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>{t('admin.tokenUsage.avgDuration')}</th>
          </tr>
        </thead>
        <tbody>
          {usage.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary }}>{t('admin.tokenUsage.noUsage')}</td></tr>
          ) : (
            usage.map((item, index) => (
              <tr key={item.operation} style={{ backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default, borderBottom: `1px solid ${theme.colors.border.light}` }}>
                <td style={{ padding: theme.spacing.md, fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary, borderRight: `1px solid ${theme.colors.border.light}` }}>{getOperationLabel(item.operation)}</td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.primary, borderRight: `1px solid ${theme.colors.border.light}` }}>{formatNumber(item.callCount)}</td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.secondary, borderRight: `1px solid ${theme.colors.border.light}` }}>{formatNumber(item.totalPromptTokens)}</td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.secondary, borderRight: `1px solid ${theme.colors.border.light}` }}>{formatNumber(item.totalCompletionTokens)}</td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, borderRight: `1px solid ${theme.colors.border.light}` }}>{formatNumber(item.totalTokens)}</td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', color: item.htmlCallCount > 0 ? theme.colors.accent.warning : theme.colors.text.secondary, fontWeight: item.htmlCallCount > 0 ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal, borderRight: `1px solid ${theme.colors.border.light}` }}>
                  {item.htmlCallCount > 0 ? (
                    <span title={`${((item.htmlCallCount / item.callCount) * 100).toFixed(1)}% of calls contain HTML`}>
                      {formatNumber(item.htmlCallCount)} ({((item.htmlCallCount / item.callCount) * 100).toFixed(0)}%)
                    </span>
                  ) : '0'}
                </td>
                <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.primary }}>{formatDuration(item.avgDurationMs, noDataLabel)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

interface ExamplesSectionProps {
  examples: PromptExample[];
  examplesLoading: boolean;
  resetting: boolean;
  expandedExample: string | null;
  onToggleExpand: (op: string | null) => void;
  onReset: () => void;
}

interface ExampleItemProps {
  example: PromptExample;
  isExpanded: boolean;
  onToggle: () => void;
}

const TokenExampleItem: React.FC<ExampleItemProps> = ({ example, isExpanded, onToggle }) => {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, border: `1px solid ${example.containsHtml ? theme.colors.accent.warning : theme.colors.border.light}`, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: theme.spacing.md, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isExpanded ? theme.colors.background.default : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>{getOperationLabel(example.operation)}</span>
          {example.containsHtml && <span style={{ padding: `${theme.spacing.xs} ${theme.spacing.sm}`, backgroundColor: theme.colors.accent.warning, color: theme.colors.background.paper, borderRadius: theme.borderRadius.sm, fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.bold }}>{t('admin.tokenUsage.examples.containsHtml')}</span>}
          <span style={{ padding: `${theme.spacing.xs} ${theme.spacing.sm}`, backgroundColor: theme.colors.primary.light, color: theme.colors.primary.dark, borderRadius: theme.borderRadius.sm, fontSize: theme.typography.fontSize.xs }}>{formatNumber(example.promptTokens)} {t('admin.tokenUsage.examples.tokens')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>{example.provider}/{example.model}</span>
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>{new Date(example.capturedAt).toLocaleString()}</span>
          <span style={{ color: theme.colors.text.secondary }}>{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, backgroundColor: theme.colors.background.default }}>
          <pre style={{ margin: 0, padding: theme.spacing.md, backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.sm, overflow: 'auto', maxHeight: '400px', fontSize: theme.typography.fontSize.sm, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: theme.colors.text.primary, border: `1px solid ${theme.colors.border.light}` }}>
            {example.promptText}
          </pre>
        </div>
      )}
    </div>
  );
};

const TokenExamplesSection: React.FC<ExamplesSectionProps> = ({
  examples, examplesLoading, resetting, expandedExample, onToggleExpand, onReset,
}) => {
  const { t } = useTranslation();

  if (examplesLoading && examples.length === 0) {
    return <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.text.secondary }}>{t('admin.tokenUsage.examples.loadingExamples')}</div>;
  }

  return (
    <div style={{ marginTop: theme.spacing.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <h3 style={{ margin: 0, fontSize: theme.typography.fontSize.xl, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>{t('admin.tokenUsage.examples.title')}</h3>
        <button
          onClick={onReset}
          disabled={resetting || examples.length === 0}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: examples.length === 0 ? theme.colors.background.default : theme.colors.accent.error,
            color: examples.length === 0 ? theme.colors.text.disabled : theme.colors.background.paper,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: examples.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: resetting ? OPACITY_DISABLED_ALT : 1,
          }}
        >
          {resetting ? t('admin.tokenUsage.examples.resetting') : t('admin.tokenUsage.examples.resetButton')}
        </button>
      </div>

      {examples.length === 0 ? (
        <div style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary, backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}` }}>
          {t('admin.tokenUsage.examples.noExamples')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {examples.map((example) => (
            <TokenExampleItem
              key={example.operation}
              example={example}
              isExpanded={expandedExample === example.operation}
              onToggle={() => onToggleExpand(expandedExample === example.operation ? null : example.operation)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Data hook ---

interface TokenUsageData {
  usage: UsageByOperation[];
  summary: UsageSummary | null;
  examples: PromptExample[];
  loading: boolean;
  examplesLoading: boolean;
  resetting: boolean;
  lastUpdated: Date | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  expandedExample: string | null;
  setExpandedExample: (op: string | null) => void;
  resetExamples: () => Promise<void>;
}

const useTokenUsageData = (): TokenUsageData => {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<UsageByOperation[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [examples, setExamples] = useState<PromptExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGE_7D);
  const [expandedExample, setExpandedExample] = useState<string | null>(null);

  const getDateRangeParams = useCallback((): { startDate?: string } => {
    const now = new Date();
    switch (dateRange) {
      case DATE_RANGE_24H: return { startDate: new Date(now.getTime() - MS_PER_DAY).toISOString() };
      case DATE_RANGE_7D: return { startDate: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_30D: return { startDate: new Date(now.getTime() - DAYS_IN_MONTH_30 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_ALL: default: return {};
    }
  }, [dateRange]);

  const fetchExamples = useCallback(async () => {
    try {
      setExamplesLoading(true);
      const response = await axios.get(`${API_URL}/admin/token-usage/examples`);
      setExamples(response.tokenData.examples || []);
    } catch (error) { console.error('Error fetching prompt examples:', error); }
    finally { setExamplesLoading(false); }
  }, []);

  const fetchUsageData = useCallback(async () => {
    try {
      const params = getDateRangeParams();
      const [usageResponse, summaryResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/token-usage`, { params }),
        axios.get(`${API_URL}/admin/token-usage/summary`, { params }),
      ]);
      setUsage(usageResponse.tokenData.usage);
      setSummary(summaryResponse.tokenData.summary);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) { console.error('Error fetching token usage:', error); setLoading(false); }
  }, [getDateRangeParams]);

  const resetExamples = async () => {
    if (!window.confirm(t('admin.tokenUsage.examples.confirmReset'))) return;
    try {
      setResetting(true);
      await axios.post(`${API_URL}/admin/token-usage/examples/reset`);
      setExamples([]);
      setExpandedExample(null);
    } catch (error) { console.error('Error resetting prompt examples:', error); }
    finally { setResetting(false); }
  };

  useEffect(() => {
    fetchUsageData();
    fetchExamples();
    const interval = setInterval(() => { fetchUsageData(); fetchExamples(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dateRange, fetchUsageData, fetchExamples]);

  return { usage, summary, examples, loading, examplesLoading, resetting, lastUpdated, dateRange, setDateRange, expandedExample, setExpandedExample, resetExamples };
};

// --- Main component ---

export const TokenUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const tokenData = useTokenUsageData();

  if (tokenData.loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <h2 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.text.primary }}>
          {t('admin.tokenUsage.title')}
        </h2>
        {tokenData.lastUpdated && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.lastUpdated')}: {tokenData.lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
      <TokenDateFilter dateRange={tokenData.dateRange} onDateRangeChange={tokenData.setDateRange} />
      {tokenData.summary && <TokenSummaryCards summary={tokenData.summary} />}
      <TokenUsageTable usage={tokenData.usage} noDataLabel={t('admin.tokenUsage.noData')} />
      <TokenExamplesSection
        examples={tokenData.examples}
        examplesLoading={tokenData.examplesLoading}
        resetting={tokenData.resetting}
        expandedExample={tokenData.expandedExample}
        onToggleExpand={tokenData.setExpandedExample}
        onReset={tokenData.resetExamples}
      />
    </div>
  );
};
