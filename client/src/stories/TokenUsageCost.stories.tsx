/**
 * Token Usage admin panels with the estimated-$ column — summary cards plus the
 * per-operation table sorted by estimated cost (a high-token Nova operation
 * ranks below cheaper-token but pricier Gemini/OpenAI operations).
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { TokenSummaryCards, TokenUsageTable } from 'components/admin/TokenUsagePanels';
import type { UsageByOperation, UsageSummary } from 'components/admin/TokenUsageSection.types';

const SUMMARY: UsageSummary = {
  totalCalls: 6900,
  totalPromptTokens: 9_510_000,
  totalCompletionTokens: 662_300,
  totalTokens: 10_180_000,
  avgDurationMs: 980,
  totalEstimatedCostUsd: 1.87,
};

const USAGE: UsageByOperation[] = [
  {
    operation: 'analyze_priority',
    callCount: 587,
    totalPromptTokens: 2_770_000,
    totalCompletionTokens: 138_300,
    totalTokens: 2_910_000,
    avgDurationMs: 1900,
    htmlCallCount: 0,
    estimatedCostUsd: 0.9,
    models: ['gemini-3.1-flash'],
  },
  {
    operation: 'check_category_duplicate',
    callCount: 41,
    totalPromptTokens: 253_000,
    totalCompletionTokens: 61_000,
    totalTokens: 314_000,
    avgDurationMs: 4200,
    htmlCallCount: 0,
    estimatedCostUsd: 0.31,
    models: ['gpt-5.4-mini'],
  },
  {
    operation: 'classify_contact_type',
    callCount: 674,
    totalPromptTokens: 492_500,
    totalCompletionTokens: 38_300,
    totalTokens: 530_800,
    avgDurationMs: 1100,
    htmlCallCount: 254,
    estimatedCostUsd: 0.18,
    models: ['amazon.nova-micro-v1:0'],
  },
  {
    operation: 'summarize_email_with_phishing_check',
    callCount: 915,
    totalPromptTokens: 1_890_000,
    totalCompletionTokens: 144_000,
    totalTokens: 2_030_000,
    avgDurationMs: 723,
    htmlCallCount: 915,
    estimatedCostUsd: 0.086,
    models: ['amazon.nova-micro-v1:0'],
  },
  {
    operation: 'incremental_summary',
    callCount: 1100,
    totalPromptTokens: 1_240_000,
    totalCompletionTokens: 92_900,
    totalTokens: 1_340_000,
    avgDurationMs: 522,
    htmlCallCount: 0,
    estimatedCostUsd: 0.056,
    models: ['amazon.nova-micro-v1:0'],
  },
  {
    operation: 'check_phishing_only',
    callCount: 915,
    totalPromptTokens: 632_200,
    totalCompletionTokens: 10_000,
    totalTokens: 642_200,
    avgDurationMs: 402,
    htmlCallCount: 915,
    estimatedCostUsd: 0.0235,
    models: ['amazon.nova-micro-v1:0'],
  },
  {
    operation: 'category_embedding',
    callCount: 765,
    totalPromptTokens: 298_800,
    totalCompletionTokens: 0,
    totalTokens: 298_800,
    avgDurationMs: 1100,
    htmlCallCount: 0,
    estimatedCostUsd: null,
    models: ['text-embedding-3-small'],
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
