import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { EMOJI_CLOSE } from 'constants/emojis';

const ACTION_ITEM_SOURCE_LLM = 'llm';

interface ActionItem {
  id?: string;
  description: string;
  isCompleted: boolean;
  source: string;
}

interface ActionItemListProps {
  actionItems: ActionItem[];
  onToggleActionItem: (itemId: string, completed: boolean) => void;
  onDeleteActionItem: (itemId: string) => void;
}

export const ActionItemList: React.FC<ActionItemListProps> = ({
  actionItems,
  onToggleActionItem,
  onDeleteActionItem,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {actionItems.map((item) => (
        <div key={item.id || `action-${item.description}`} style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <input
            type="checkbox"
            checked={item.isCompleted}
            onChange={(event) => {
              if (item.id) {
                captureEvent('action_item_toggled', { completed: event.target.checked });
                onToggleActionItem(item.id, event.target.checked);
              }
            }}
            style={{ marginTop: '4px', cursor: 'pointer' }}
          />
          <span style={{ 
            flex: 1,
            textDecoration: item.isCompleted ? 'line-through' : 'none',
            color: item.isCompleted ? theme.colors.text.tertiary : theme.colors.text.primary,
          }}>
            {item.description}
            {item.source === ACTION_ITEM_SOURCE_LLM && (
              <span style={{ 
                fontSize: '0.7rem', 
                backgroundColor: theme.colors.primary.subtle, 
                color: theme.colors.primary.main,
                padding: '2px 6px',
                borderRadius: '4px',
                marginLeft: theme.spacing.sm,
              }}>{t('emailDetail.aiBadge')}</span>
            )}
          </span>
          {item.id && (
            <button
              onClick={() => {
                captureEvent('action_item_deleted');
                onDeleteActionItem(item.id!);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.colors.text.tertiary,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                padding: theme.spacing.xs,
                display: 'flex',
                alignItems: 'center',
                opacity: 0.6,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = '1';
                event.currentTarget.style.color = theme.colors.error?.main || theme.colors.accent.error;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = '0.6';
                event.currentTarget.style.color = theme.colors.text.tertiary;
              }}
              title={t('emailDetail.deleteActionItem')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {EMOJI_CLOSE}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};


