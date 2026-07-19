import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TokenDateFilter, TokenExamplesSection, TokenSummaryCards, TokenUsageTable, TokenUserUsageTable } from './TokenUsagePanels';
import { useTokenUsageData } from './useTokenUsageData';

export const TokenUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const tokenData = useTokenUsageData();

  if (tokenData.loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
          }}
        >
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
      <TokenUserUsageTable users={tokenData.usageByUser} />
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
