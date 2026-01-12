import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
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

  return (
    <div className="animate-fade-in" style={{
      backgroundColor: theme.colors.primary.subtle,
      padding: theme.spacing.xl,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.xl,
      borderLeft: `4px solid ${theme.colors.primary.main}`,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: summaryCollapsed ? 0 : theme.spacing.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <span>🤖</span>
          <strong style={{ color: theme.colors.primary.dark }}>{t('emailDetail.aiSummary')}</strong>
          <button
            onClick={onToggleCollapsed}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              padding: theme.spacing.xs,
            }}
            title={summaryCollapsed ? t('emailDetail.expandSummary') : t('emailDetail.collapseSummary')}
          >
            {summaryCollapsed ? '▶' : '▼'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
          <select
            value={summaryType}
            onChange={(e) => {
              if (e.target.value === SUMMARY_TYPE_CUSTOM) {
                onShowRuleModal();
              } else if (e.target.value.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
                // Properly extract ruleId by removing the prefix (handles UUIDs with hyphens)
                const ruleId = e.target.value.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
                const rule = customRules.find(r => r.ruleId === ruleId);
                if (rule) {
                  // onSummaryTypeChange will handle calling handleUseCustomRule via EmailDetail handler
                  // This avoids double-calling while ensuring summaryType is set immediately
                  onSummaryTypeChange(e.target.value);
                } else {
                  console.error('Custom rule not found:', ruleId);
                  // Reset to previous value if rule not found
                  onSummaryTypeChange(summaryType);
                }
              } else {
                onSummaryTypeChange(e.target.value);
              }
            }}
            disabled={isGeneratingSummary}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              backgroundColor: 'white',
              cursor: isGeneratingSummary ? 'wait' : 'pointer',
            }}
          >
            <option value="tldr">{t('emailDetail.summaryTypes.tldr')}</option>
            <option value="bullet-points">{t('emailDetail.summaryTypes.bulletPoints')}</option>
            <option value="action-items">{t('emailDetail.summaryTypes.actionItems')}</option>
            <option value="sender-request">{t('emailDetail.summaryTypes.senderRequest')}</option>
            {customRules.length > 0 && (
              <>
                <optgroup label={t('emailDetail.summaryTypes.customRules')}>
                  {customRules.map((rule) => (
                    <option key={rule.ruleId} value={`custom-${rule.ruleId}`}>
                      {rule.whenToUse}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
            <option value="custom">{t('emailDetail.createCustomRule')}...</option>
          </select>
          {isGeneratingSummary && (
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: `2px solid ${theme.colors.primary.main}`,
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          )}
        </div>
      </div>
      {!summaryCollapsed && (
        <>
          {(() => {
            if (isGeneratingSummary || emailIsProcessingSummary) {
              return (
                <div style={{
                  padding: theme.spacing.xl,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '24px',
                    height: '24px',
                    border: `3px solid ${theme.colors.primary.main}`,
                    borderTop: '3px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: theme.spacing.md,
                  }} />
                  <div>✨ {t('emailDetail.generatingSummary')}</div>
                </div>
              );
            }
            if (summary) {
              return (
                <div style={{ whiteSpace: 'pre-wrap', color: theme.colors.text.primary, lineHeight: theme.typography.lineHeight.relaxed }}>
                  {summary}
                </div>
              );
            }
            return (
              <div style={{
                padding: theme.spacing.lg,
                textAlign: 'center',
                color: theme.colors.text.secondary,
                fontStyle: 'italic',
              }}>
                📝 {t('emailDetail.noSummary')}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

