import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { TEXT_TRUNCATE_LENGTH } from 'constants/numbers';

interface SimpleDraftDisplayProps {
  draft: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
}

export const SimpleDraftDisplay: React.FC<SimpleDraftDisplayProps> = ({
  draft,
  isExpanded,
  onToggleExpand,
  onEdit,
}) => {
  const { t } = useTranslation();
  const displayText = isExpanded
    ? draft
    : `${draft.substring(0, TEXT_TRUNCATE_LENGTH)}${draft.length > TEXT_TRUNCATE_LENGTH ? '...' : ''}`;

  return (
    <div
      style={{
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.sm,
        marginTop: theme.spacing.sm,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          whiteSpace: 'pre-wrap',
          marginBottom: theme.spacing.xs,
        }}
      >
        {displayText}
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          onClick={event => {
            event.stopPropagation();
            onToggleExpand();
          }}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {isExpanded ? t('common.showLess') : t('common.showMore')}
        </button>
        <button
          onClick={event => {
            event.stopPropagation();
            onEdit();
          }}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {t('common.edit')}
        </button>
      </div>
    </div>
  );
};
