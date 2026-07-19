/**
 * SummarySectionWrapper — stateful wrapper for SummarySection stories.
 * Manages summaryType and collapsed state.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { SummarySection } from 'components/email-detail/SummarySection';

import { summarySectionI18n } from './i18nInstances';

export interface SummarySectionWrapperProps {
  summary?: string | null;
  loading?: boolean;
  processing?: boolean;
  defaultCollapsed?: boolean;
  /** Container width — narrow values reproduce the split-view header layout. */
  width?: number;
  /** Initial summary type (e.g. 'sender-request' — the widest dropdown label). */
  initialSummaryType?: string;
}

export const SummarySectionWrapper: React.FC<SummarySectionWrapperProps> = ({
  summary = null,
  loading = false,
  processing = false,
  defaultCollapsed = false,
  width = 640,
  initialSummaryType = 'tldr',
}) => {
  const [summaryType, setSummaryType] = useState(initialSummaryType);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <I18nextProvider i18n={summarySectionI18n}>
      <div style={{ maxWidth: width }}>
        <SummarySection
          summary={summary ?? null}
          summaryType={summaryType}
          summaryCollapsed={collapsed}
          isGeneratingSummary={loading}
          emailIsProcessingSummary={processing}
          customRules={[]}
          onSummaryTypeChange={setSummaryType}
          onToggleCollapsed={() => setCollapsed(prev => !prev)}
          onShowRuleModal={() => alert('Custom rule modal would open here')}
          onUseCustomRule={() => {}}
        />
      </div>
    </I18nextProvider>
  );
};
