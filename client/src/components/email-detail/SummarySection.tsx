import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { SUMMARY_PREVIEW_MAX_CHARS } from 'constants/numbers';
import { SUMMARY_TYPE_CUSTOM, SUMMARY_TYPE_CUSTOM_PREFIX } from 'constants/strings';

interface SummarySectionProps {
  summary: string | null;
  summaryType: string;
  summaryCollapsed: boolean;
  isGeneratingSummary: boolean;
  emailIsProcessingSummary?: boolean;
  customRules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>;
  onSummaryTypeChange: (type: string) => void;
  onToggleCollapsed: () => void;
  onShowRuleModal: () => void;
  onUseCustomRule: (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => void;
}

// eslint-disable-next-line max-lines-per-function -- Summary section component requires handling multiple summary types and UI states
export const SummarySection: React.FC<SummarySectionProps> = ({
  summary,
  summaryType,
  summaryCollapsed,
  isGeneratingSummary,
  emailIsProcessingSummary,
  customRules,
  onSummaryTypeChange,
  onToggleCollapsed,
  onShowRuleModal,
  onUseCustomRule,
}) => {
  const { t } = useTranslation();

  const previewText = (() => {
    if (isGeneratingSummary || emailIsProcessingSummary) {
      return t('emailDetail.generatingSummary');
    }
    if (summary) {
      return summary.slice(0, SUMMARY_PREVIEW_MAX_CHARS) + (summary.length > SUMMARY_PREVIEW_MAX_CHARS ? '…' : '');
    }
    return t('emailDetail.noSummary');
  })();

  const controls = (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
      <select
        value={summaryType}
        onChange={event => {
          if (event.target.value === SUMMARY_TYPE_CUSTOM) {
            onShowRuleModal();
          } else if (event.target.value.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
            const ruleId = event.target.value.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
            const rule = customRules.find(rule => rule.ruleId === ruleId);
            if (rule) {
              onSummaryTypeChange(event.target.value);
            } else {
              onSummaryTypeChange(summaryType);
            }
          } else {
            onSummaryTypeChange(event.target.value);
          }
        }}
        disabled={isGeneratingSummary}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          backgroundColor: COLOR_NAMED_WHITE,
          cursor: isGeneratingSummary ? 'wait' : 'pointer',
        }}
      >
        <option value="tldr">{t('emailDetail.summaryTypes.tldr')}</option>
        <option value="bullet-points">{t('emailDetail.summaryTypes.bulletPoints')}</option>
        <option value="action-items">{t('emailDetail.summaryTypes.actionItems')}</option>
        <option value="sender-request">{t('emailDetail.summaryTypes.senderRequest')}</option>
        {customRules.length > 0 && (
          <optgroup label={t('emailDetail.summaryTypes.customRules')}>
            {customRules.map(rule => (
              <option key={rule.ruleId} value={`custom-${rule.ruleId}`}>
                {rule.whenToUse}
              </option>
            ))}
          </optgroup>
        )}
        <option value="custom">{t('emailDetail.createCustomRule')}...</option>
      </select>
      {isGeneratingSummary && (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: `2px solid ${theme.colors.section.summary.accent}`,
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );

  return (
    <CollapsibleSection
      icon={<span>🤖</span>}
      title={t('emailDetail.aiSummary')}
      isCollapsed={summaryCollapsed}
      onToggle={onToggleCollapsed}
      accentColor={theme.colors.section.summary.accent}
      backgroundColor={theme.colors.section.summary.background}
      preview={previewText}
      controls={controls}
    >
      {(() => {
        if (isGeneratingSummary || emailIsProcessingSummary) {
          return (
            <div
              style={{
                padding: theme.spacing.xl,
                textAlign: 'center',
                color: theme.colors.text.secondary,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '24px',
                  height: '24px',
                  border: `3px solid ${theme.colors.section.summary.accent}`,
                  borderTop: '3px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: theme.spacing.md,
                }}
              />
              <div>✨ {t('emailDetail.generatingSummary')}</div>
            </div>
          );
        }
        if (summary) {
          return (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                color: theme.colors.text.primary,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            >
              {summary}
            </div>
          );
        }
        return (
          <div
            style={{
              padding: theme.spacing.lg,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              fontStyle: 'italic',
            }}
          >
            📝 {t('emailDetail.noSummary')}
          </div>
        );
      })()}
    </CollapsibleSection>
  );
};
