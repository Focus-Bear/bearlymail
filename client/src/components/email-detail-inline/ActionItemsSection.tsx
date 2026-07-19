import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckSquare } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { ActionItemInput } from 'components/email-detail-inline/ActionItemInput';
import { ActionItemList } from 'components/email-detail-inline/ActionItemList';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

const ACTION_ITEMS_ACCENT = '#16A34A';
const ACTION_ITEMS_BG = '#F0FDF4';
const ACTION_ITEM_SOURCE_LLM = 'llm';

interface ActionItem {
  id?: string;
  description: string;
  isCompleted: boolean;
  source: string;
}

interface ActionItemsSectionProps {
  actionItems: ActionItem[];
  newActionItem: string;
  isGeneratingSummary: boolean;
  onNewActionItemChange: (value: string) => void;
  onAddActionItem: () => void;
  onToggleActionItem: (itemId: string, completed: boolean) => void;
  onDeleteActionItem: (itemId: string) => void;
  onExtractActions: () => void;
  onRegenerateActionItems?: () => void;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

export const ActionItemsSection: React.FC<ActionItemsSectionProps> = ({
  actionItems,
  newActionItem,
  isGeneratingSummary,
  onNewActionItemChange,
  onAddActionItem,
  onToggleActionItem,
  onDeleteActionItem,
  onExtractActions,
  onRegenerateActionItems,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const completedCount = actionItems.filter(i => i.isCompleted).length;
  const preview =
    actionItems.length > 0
      ? `${completedCount}/${actionItems.length} ${t('emailDetail.actionItems').toLowerCase()}`
      : t('emailDetail.noActionItems') || 'No action items';

  const controls = (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
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
          🔄
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
          color: ACTION_ITEMS_ACCENT,
          cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          opacity: isGeneratingSummary ? OPACITY_DISABLED : OPACITY_FULL,
          whiteSpace: 'nowrap',
        }}
      >
        {isGeneratingSummary ? t('emailDetail.extracting') : `✨ ${t('emailDetail.suggestActions')}`}
      </button>
    </div>
  );

  return (
    <CollapsibleSection
      icon={<FiCheckSquare size={18} />}
      title={t('emailDetail.actionItems')}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed(!isCollapsed)}
      accentColor={ACTION_ITEMS_ACCENT}
      backgroundColor={ACTION_ITEMS_BG}
      preview={preview}
      controls={controls}
      controlsBelow
      onDismiss={onDismiss}
      dismissTitle={t('emailDetail.hideCard')}
    >
      <ActionItemList
        actionItems={actionItems}
        onToggleActionItem={onToggleActionItem}
        onDeleteActionItem={onDeleteActionItem}
      />
      <ActionItemInput
        newActionItem={newActionItem}
        onNewActionItemChange={onNewActionItemChange}
        onAddActionItem={onAddActionItem}
      />
    </CollapsibleSection>
  );
};
