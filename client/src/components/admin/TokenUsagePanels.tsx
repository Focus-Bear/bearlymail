import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED_ALT } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

import { DateRange, PromptExample, UsageByOperation, UsageByUser, UsageSummary } from './TokenUsageSection.types';
import { formatCostUsd, formatDuration, formatNumber, getOperationLabel } from './tokenUsageUtils';

interface SummaryCardsProps {
  summary: UsageSummary;
}

export const TokenSummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => {
  const { t } = useTranslation();
  const cardStyle = {
    backgroundColor: theme.colors.background.paper,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border.light}`,
  };
  const labelStyle = { fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary };
  const valueStyle = {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl,
      }}
    >
      <div style={cardStyle}>
        <div style={labelStyle}>{t('admin.tokenUsage.estimatedCost')}</div>
        <div style={valueStyle} title={t('admin.tokenUsage.estimatedCostHint')}>
          {formatCostUsd(summary.totalEstimatedCostUsd, t('admin.tokenUsage.noData'))}
        </div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>{t('admin.tokenUsage.totalCalls')}</div>
        <div style={valueStyle}>{formatNumber(summary.totalCalls)}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>{t('admin.tokenUsage.totalTokens')}</div>
        <div style={valueStyle}>{formatNumber(summary.totalTokens)}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>{t('admin.tokenUsage.promptTokens')}</div>
        <div style={valueStyle}>{formatNumber(summary.totalPromptTokens)}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>{t('admin.tokenUsage.completionTokens')}</div>
        <div style={valueStyle}>{formatNumber(summary.totalCompletionTokens)}</div>
      </div>
    </div>
  );
};

interface DateFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export const TokenDateFilter: React.FC<DateFilterProps> = ({ dateRange, onDateRangeChange }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
      {(['24h', '7d', '30d', 'all'] as DateRange[]).map(range => (
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

interface UsageTableRowProps {
  item: UsageByOperation;
  index: number;
  noDataLabel: string;
}

const TD_BORDER_RIGHT = `1px solid ${theme.colors.border.light}`;

const ModelCell: React.FC<{ models: string[]; noDataLabel: string }> = ({ models, noDataLabel }) => (
  <td
    style={{
      padding: theme.spacing.md,
      color: theme.colors.text.secondary,
      fontSize: theme.typography.fontSize.sm,
      borderRight: TD_BORDER_RIGHT,
    }}
  >
    {models.length > 0 ? models.join(', ') : noDataLabel}
  </td>
);

const TokenUsageTableRow: React.FC<UsageTableRowProps> = ({ item, index, noDataLabel }) => (
  <tr
    style={{
      backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
      borderBottom: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <td
      style={{
        padding: theme.spacing.md,
        fontWeight: theme.typography.fontWeight.medium,
        color: theme.colors.text.primary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {getOperationLabel(item.operation)}
    </td>
    <ModelCell models={item.models ?? []} noDataLabel={noDataLabel} />
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {formatCostUsd(item.estimatedCostUsd, noDataLabel)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        color: theme.colors.text.primary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {formatNumber(item.callCount)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        color: theme.colors.text.secondary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {formatNumber(item.totalPromptTokens)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        color: theme.colors.text.secondary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {formatNumber(item.totalCompletionTokens)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {formatNumber(item.totalTokens)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        color: item.htmlCallCount > 0 ? theme.colors.accent.warning : theme.colors.text.secondary,
        fontWeight: item.htmlCallCount > 0 ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
        borderRight: TD_BORDER_RIGHT,
      }}
    >
      {item.htmlCallCount > 0 ? (
        <span title={`${((item.htmlCallCount / item.callCount) * 100).toFixed(1)}% of calls contain HTML`}>
          {formatNumber(item.htmlCallCount)} ({((item.htmlCallCount / item.callCount) * 100).toFixed(0)}%)
        </span>
      ) : (
        '0'
      )}
    </td>
    <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.primary }}>
      {formatDuration(item.avgDurationMs, noDataLabel)}
    </td>
  </tr>
);

export const TokenUsageTable: React.FC<UsageTableProps> = ({ usage, noDataLabel }) => {
  const { t } = useTranslation();
  const thStyle = {
    padding: theme.spacing.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    borderRight: `1px solid ${theme.colors.border.light}`,
  };
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              backgroundColor: theme.colors.background.default,
              borderBottom: `2px solid ${theme.colors.border.medium}`,
            }}
          >
            <th style={{ ...thStyle, textAlign: 'left' }}>{t('admin.tokenUsage.operation')}</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>{t('admin.tokenUsage.model')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }} title={t('admin.tokenUsage.estimatedCostHint')}>
              {t('admin.tokenUsage.estimatedCost')}
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.calls')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.promptTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.completionTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.totalTokens')}</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.htmlCalls')}</th>
            <th
              style={{
                padding: theme.spacing.md,
                textAlign: 'center',
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
              }}
            >
              {t('admin.tokenUsage.avgDuration')}
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary }}
              >
                {t('admin.tokenUsage.noUsage')}
              </td>
            </tr>
          ) : (
            usage.map((item, index) => (
              <TokenUsageTableRow key={item.operation} item={item} index={index} noDataLabel={noDataLabel} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

interface UserUsageTableProps {
  users: UsageByUser[];
}

const RANK_COLUMN_WIDTH = '48px';

export const TokenUserUsageTable: React.FC<UserUsageTableProps> = ({ users }) => {
  const { t } = useTranslation();
  const thStyle = {
    padding: theme.spacing.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    borderRight: `1px solid ${theme.colors.border.light}`,
  };

  return (
    <div style={{ marginTop: theme.spacing.xl }}>
      <h3
        style={{
          margin: `0 0 ${theme.spacing.md} 0`,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.tokenUsage.byUser.title')}
      </h3>
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          overflow: 'hidden',
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                backgroundColor: theme.colors.background.default,
                borderBottom: `2px solid ${theme.colors.border.medium}`,
              }}
            >
              <th style={{ ...thStyle, textAlign: 'left' }}>{t('admin.tokenUsage.byUser.rank')}</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>{t('admin.tokenUsage.byUser.user')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.calls')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.promptTokens')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{t('admin.tokenUsage.completionTokens')}</th>
              <th
                style={{
                  ...thStyle,
                  textAlign: 'center',
                  borderRight: 'none',
                }}
              >
                {t('admin.tokenUsage.totalTokens')}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary }}
                >
                  {t('admin.tokenUsage.noUsage')}
                </td>
              </tr>
            ) : (
              users.map((user, index) => (
                <tr
                  key={user.userId}
                  style={{
                    backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  <td
                    style={{
                      padding: theme.spacing.md,
                      textAlign: 'center',
                      fontWeight: theme.typography.fontWeight.bold,
                      color: theme.colors.text.secondary,
                      borderRight: TD_BORDER_RIGHT,
                      width: RANK_COLUMN_WIDTH,
                    }}
                  >
                    #{index + 1}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.md,
                      color: theme.colors.text.primary,
                      borderRight: TD_BORDER_RIGHT,
                      fontFamily: 'monospace',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    {user.userEmail ?? user.userId}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.md,
                      textAlign: 'center',
                      color: theme.colors.text.primary,
                      borderRight: TD_BORDER_RIGHT,
                    }}
                  >
                    {formatNumber(user.callCount)}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.md,
                      textAlign: 'center',
                      color: theme.colors.text.secondary,
                      borderRight: TD_BORDER_RIGHT,
                    }}
                  >
                    {formatNumber(user.totalPromptTokens)}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.md,
                      textAlign: 'center',
                      color: theme.colors.text.secondary,
                      borderRight: TD_BORDER_RIGHT,
                    }}
                  >
                    {formatNumber(user.totalCompletionTokens)}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.md,
                      textAlign: 'center',
                      fontWeight: theme.typography.fontWeight.semibold,
                      color: theme.colors.text.primary,
                    }}
                  >
                    {formatNumber(user.totalTokens)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface ExampleItemProps {
  example: PromptExample;
  isExpanded: boolean;
  onToggle: () => void;
}

const TokenExampleItem: React.FC<ExampleItemProps> = ({ example, isExpanded, onToggle }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${example.containsHtml ? theme.colors.accent.warning : theme.colors.border.light}`,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: theme.spacing.md,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: isExpanded ? theme.colors.background.default : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
            {getOperationLabel(example.operation)}
          </span>
          {example.containsHtml && (
            <span
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: theme.colors.accent.warning,
                color: theme.colors.background.paper,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {t('admin.tokenUsage.examples.containsHtml')}
            </span>
          )}
          <span
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.primary.light,
              color: theme.colors.primary.dark,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {formatNumber(example.promptTokens)} {t('admin.tokenUsage.examples.tokens')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {example.provider}/{example.model}
          </span>
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {new Date(example.capturedAt).toLocaleString()}
          </span>
          <span style={{ color: theme.colors.text.secondary }}>{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.md,
            borderTop: `1px solid ${theme.colors.border.light}`,
            backgroundColor: theme.colors.background.default,
          }}
        >
          <pre
            style={{
              margin: 0,
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.sm,
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: theme.typography.fontSize.sm,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: theme.colors.text.primary,
              border: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {example.promptText}
          </pre>
        </div>
      )}
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

export const TokenExamplesSection: React.FC<ExamplesSectionProps> = ({
  examples,
  examplesLoading,
  resetting,
  expandedExample,
  onToggleExpand,
  onReset,
}) => {
  const { t } = useTranslation();

  if (examplesLoading && examples.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.text.secondary }}>
        {t('admin.tokenUsage.examples.loadingExamples')}
      </div>
    );
  }

  return (
    <div style={{ marginTop: theme.spacing.xl }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('admin.tokenUsage.examples.title')}
        </h3>
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
        <div
          style={{
            padding: theme.spacing.xl,
            textAlign: 'center',
            color: theme.colors.text.secondary,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          {t('admin.tokenUsage.examples.noExamples')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {examples.map(example => (
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
