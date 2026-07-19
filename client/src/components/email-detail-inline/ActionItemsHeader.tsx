import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

const ACTION_ITEM_SOURCE_LLM = 'llm';

interface ActionItem {
  id?: string;
  description: string;
  isCompleted: boolean;
  source: string;
}

interface ActionItemsHeaderProps {
  actionItems: ActionItem[];
  isGeneratingSummary: boolean;
  onExtractActions: () => void;
  onRegenerateActionItems?: () => void;
}

export const ActionItemsHeader: React.FC<ActionItemsHeaderProps> = ({
  actionItems,
  isGeneratingSummary,
  onExtractActions,
  onRegenerateActionItems,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
        marginBottom: theme.spacing.md,
      }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minWidth: 0,
        }}
      >
        ✅ {t('emailDetail.actionItems')}
      </h3>
      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexShrink: 0 }}>
        {actionItems.some(item => item.source === ACTION_ITEM_SOURCE_LLM) && onRegenerateActionItems && (
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.ACTION_ITEMS_REGENERATE_CLICKED);
              onRegenerateActionItems();
            }}
            disabled={isGeneratingSummary}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.text.secondary,
              cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              opacity: isGeneratingSummary ? OPACITY_DISABLED : OPACITY_FULL,
            }}
            title={t('emailDetail.regenerateActions')}
          >
            🔄 {t('emailDetail.regenerateActions')}
          </button>
        )}
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.ACTION_ITEMS_SUGGEST_CLICKED);
            onExtractActions();
          }}
          disabled={isGeneratingSummary}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.colors.primary.main,
            cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: isGeneratingSummary ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {isGeneratingSummary ? t('emailDetail.extracting') : `✨ ${t('emailDetail.suggestActions')}`}
        </button>
      </div>
    </div>
  );
};
