/**
 * Token Usage admin panels with the estimated-$ column — summary cards plus the
 * per-operation table sorted by estimated cost, using server-provided operation
 * labels. Calls on models with no price are flagged under the cost rather than
 * silently counted as $0.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { TokenSummaryCards, TokenUsageTable } from 'components/admin/TokenUsagePanels';
import type { UsageByOperation, UsageSummary } from 'components/admin/TokenUsageSection.types';

const SUMMARY: UsageSummary = {
  totalCalls: 10_700,
  totalPromptTokens: 19_610_000,
  totalCompletionTokens: 1_280_000,
  totalTokens: 20_990_000,
  avgDurationMs: 980,
  totalEstimatedCostUsd: 1.71,
  unpricedCallCount: 41,
};

const USAGE: UsageByOperation[] = [
  {
    operation: 'categorise_summary',
    operationLabel: 'Categorise From Summary',
    callCount: 1000,
    totalPromptTokens: 6_170_000,
    totalCompletionTokens: 360_000,
    totalTokens: 6_550_000,
    avgDurationMs: 1000,
    htmlCallCount: 6,
    estimatedCostUsd: 0.97,
    unpricedCallCount: 0,
    models: ['gemini-3.1-flash-lite', 'jev-1.13.0', 'gemini-3.6-flash'],
  },
  {
    operation: 'search_ranking',
    operationLabel: 'Search Ranking',
    callCount: 390,
    totalPromptTokens: 380_900,
    totalCompletionTokens: 46_600,
    totalTokens: 427_600,
    avgDurationMs: 1400,
    htmlCallCount: 16,
    estimatedCostUsd: 0.17,
    unpricedCallCount: 0,
    models: ['gemini-3.1-flash-lite'],
  },
  {
    operation: 'confirm_phishing',
    operationLabel: 'Confirm Phishing (second opinion)',
    callCount: 359,
    totalPromptTokens: 296_200,
    totalCompletionTokens: 16_800,
    totalTokens: 313_000,
    avgDurationMs: 1300,
    htmlCallCount: 1,
    estimatedCostUsd: 0.1,
    unpricedCallCount: 0,
    models: ['gemini-3.1-flash-lite'],
  },
  {
    operation: 'analyze_priority',
    operationLabel: 'Analyze Priority',
    callCount: 1200,
    totalPromptTokens: 2_640_000,
    totalCompletionTokens: 208_800,
    totalTokens: 2_850_000,
    avgDurationMs: 604,
    htmlCallCount: 0,
    estimatedCostUsd: 0.12,
    unpricedCallCount: 0,
    models: ['amazon.nova-micro-v1:0', 'jev-1.13.0'],
  },
  {
    operation: 'check_category_duplicate',
    operationLabel: 'Check Category Duplicate',
    callCount: 41,
    totalPromptTokens: 253_000,
    totalCompletionTokens: 61_000,
    totalTokens: 314_000,
    avgDurationMs: 1100,
    htmlCallCount: 0,
    estimatedCostUsd: null,
    unpricedCallCount: 41,
    models: ['gemini-3.8-flash'],
  },
];

const meta: Meta<typeof TokenUsageTable> = {
  title: 'Admin/TokenUsageCost',
  component: TokenUsageTable,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof TokenUsageTable>;

export const WithCostEstimates: Story = {
  render: () => (
    <I18nextProvider i18n={i18n}>
      <div style={{ maxWidth: 1100 }}>
        <TokenSummaryCards summary={SUMMARY} />
        <TokenUsageTable usage={USAGE} noDataLabel="—" />
      </div>
    </I18nextProvider>
  ),
};
