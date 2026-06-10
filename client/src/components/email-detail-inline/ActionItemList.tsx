import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

const ACTION_ITEM_SOURCE_LLM = 'llm';
const ACTION_ITEMS_ACCENT = '#16A34A';

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
      {actionItems.map(item => (
        <div
          key={item.id || `action-${item.description}`}
          style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}
        >
          <input
            type="checkbox"
            checked={item.isCompleted}
            onChange={event => {
              if (item.id) {
                captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_TOGGLED, { completed: event.target.checked });
                onToggleActionItem(item.id, event.target.checked);
              }
            }}
            style={{
              marginTop: '3px',
              width: '16px',
              height: '16px',
              flexShrink: 0,
              accentColor: ACTION_ITEMS_ACCENT,
              cursor: 'pointer',
            }}
          />
          <span
            style={{
              flex: 1,
              fontSize: theme.typography.fontSize.sm,
              lineHeight: 1.4,
              textDecoration: item.isCompleted ? 'line-through' : 'none',
              color: item.isCompleted ? theme.colors.text.tertiary : theme.colors.text.primary,
              wordBreak: 'break-word',
            }}
          >
            {item.description}
            {item.source === ACTION_ITEM_SOURCE_LLM && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  verticalAlign: 'middle',
                  fontSize: '0.625rem',
                  fontWeight: theme.typography.fontWeight.semibold,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  backgroundColor: theme.colors.primary.subtle,
                  color: theme.colors.primary.main,
                  padding: '1px 5px',
                  borderRadius: theme.borderRadius.sm,
                  marginLeft: theme.spacing.xs,
                }}
              >
                {t('emailDetail.aiBadge')}
              </span>
            )}
          </span>
          {item.id && (
            <button
              onClick={() => {
                captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_DELETED);
                onDeleteActionItem(item.id!);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.colors.text.tertiary,
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                opacity: 0.6,
              }}
              onMouseEnter={event => {
                event.currentTarget.style.opacity = '1';
                event.currentTarget.style.color = theme.colors.error?.main || theme.colors.accent.error;
              }}
              onMouseLeave={event => {
                event.currentTarget.style.opacity = '0.6';
                event.currentTarget.style.color = theme.colors.text.tertiary;
              }}
              title={t('emailDetail.deleteActionItem')}
            >
              <FiX size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
