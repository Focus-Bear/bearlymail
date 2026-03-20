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
}

export const SummarySectionWrapper: React.FC<SummarySectionWrapperProps> = ({
  summary = null,
  loading = false,
  processing = false,
  defaultCollapsed = false,
}) => {
  const [summaryType, setSummaryType] = useState('tldr');
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <I18nextProvider i18n={summarySectionI18n}>
      <div style={{ maxWidth: 640 }}>
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
