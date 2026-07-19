import React from 'react';
import { useTranslation } from 'react-i18next';

import { COLOR_GREY_MID, COLOR_NEAR_BLACK } from 'constants/colors';

interface InboxFamilyHeaderProps {
  family: string;
  /** Number of categories grouped under this family. */
  categoryCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

/**
 * Collapsible header for a family block in the inbox's two-level accordion.
 * Sits above the category accordions belonging to that family; collapsing it
 * hides those categories.
 */
export const InboxFamilyHeader: React.FC<InboxFamilyHeaderProps> = ({
  family,
  categoryCount,
  isCollapsed,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      data-family-header={family}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '10px 4px 4px',
        fontWeight: 700,
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: COLOR_NEAR_BLACK,
      }}
    >
      <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>{family}</span>
      <span style={{ color: COLOR_GREY_MID, fontWeight: 400 }}>
        {t('inbox.familyCategoryCount', { count: categoryCount })}
      </span>
    </button>
  );
};
