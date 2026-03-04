import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface SummarizationRuleEditFormProps {
  editSummarizationWhen: string;
  editSummarizationHow: string;
  onEditSummarizationWhenChange: (value: string) => void;
  onEditSummarizationHowChange: (value: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

export const SummarizationRuleEditForm: React.FC<SummarizationRuleEditFormProps> = ({
  editSummarizationWhen,
  editSummarizationHow,
  onEditSummarizationWhenChange,
  onEditSummarizationHowChange,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div>
          <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
            {t('settings.whenToUse')}
          </label>
          <input
            type="text"
            value={editSummarizationWhen}
            onChange={(e) => onEditSummarizationWhenChange(e.target.value)}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
            }}
          />
        </div>
        <div>
          <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
            {t('settings.howToSummarize')}
          </label>
          <textarea
            value={editSummarizationHow}
            onChange={(e) => onEditSummarizationHowChange(e.target.value)}
            style={{
              width: '100%',
              minHeight: `${INPUT_WIDTH_PX}px`,
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={onSave}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.save')}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};


