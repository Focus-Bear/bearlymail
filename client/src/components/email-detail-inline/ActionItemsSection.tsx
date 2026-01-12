import React from 'react';
import { theme } from 'theme/theme';
import { ActionItemsHeader } from 'components/email-detail-inline/ActionItemsHeader';
import { ActionItemList } from 'components/email-detail-inline/ActionItemList';
import { ActionItemInput } from 'components/email-detail-inline/ActionItemInput';

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
}) => {
  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      boxShadow: theme.shadows.sm,
      marginBottom: theme.spacing.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <ActionItemsHeader
        actionItems={actionItems}
        isGeneratingSummary={isGeneratingSummary}
        onExtractActions={onExtractActions}
        onRegenerateActionItems={onRegenerateActionItems}
      />
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
    </div>
  );
};

