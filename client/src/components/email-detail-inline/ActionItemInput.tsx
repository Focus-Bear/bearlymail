import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { KEY_ENTER } from 'constants/strings';

interface ActionItemInputProps {
  newActionItem: string;
  onNewActionItemChange: (value: string) => void;
  onAddActionItem: () => void;
}

export const ActionItemInput: React.FC<ActionItemInputProps> = ({
  newActionItem,
  onNewActionItemChange,
  onAddActionItem,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
      <input
        type="text"
        value={newActionItem}
        onChange={event => onNewActionItemChange(event.target.value)}
        onKeyDown={event => event.key === KEY_ENTER && onAddActionItem()}
        placeholder={t('emailDetail.addTaskPlaceholder')}
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      />
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_ADDED);
          onAddActionItem();
        }}
        disabled={!newActionItem.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: newActionItem.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {t('common.add')}
      </button>
    </div>
  );
};
