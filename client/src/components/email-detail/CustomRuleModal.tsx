import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface CustomRule {
  whenToUse: string;
  howToSummarize: string;
  ruleId?: string;
}

interface CustomRuleModalProps {
  show: boolean;
  customRule: CustomRule;
  onCustomRuleChange: (rule: CustomRule) => void;
  onClose: () => void;
  onCreate: () => Promise<void>;
}

// eslint-disable-next-line max-lines-per-function -- Custom rule modal requires extensive form handling and validation logic
export const CustomRuleModal: React.FC<CustomRuleModalProps> = ({
  show,
  customRule,
  onCustomRuleChange,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation();

  if (!show) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        maxWidth: '600px',
        width: '90%',
      }}>
        <h2 style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary,
        }}>
          {t('emailDetail.createCustomRule')}
        </h2>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            marginBottom: theme.spacing.xs,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}>
            {t('emailDetail.whenToUseLabel')}
          </label>
          <textarea
            value={customRule.whenToUse}
            onChange={(e) => onCustomRuleChange({ ...customRule, whenToUse: e.target.value })}
            placeholder={t('emailDetail.whenToUsePlaceholder')}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
            }}
          />
        </div>
        <div style={{ marginBottom: theme.spacing.xl }}>
          <label style={{
            display: 'block',
            marginBottom: theme.spacing.xs,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}>
            {t('emailDetail.howToSummarizeLabel')}
          </label>
          <textarea
            value={customRule.howToSummarize}
            onChange={(e) => onCustomRuleChange({ ...customRule, howToSummarize: e.target.value })}
            placeholder={t('emailDetail.howToSummarizePlaceholder')}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onCreate}
            disabled={!customRule.whenToUse || !customRule.howToSummarize}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              backgroundColor: customRule.whenToUse && customRule.howToSummarize ? theme.colors.primary.main : theme.colors.border.dark,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: customRule.whenToUse && customRule.howToSummarize ? 'pointer' : 'not-allowed',
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {t('emailDetail.createAndUse')}
          </button>
        </div>
      </div>
    </div>
  );
};



