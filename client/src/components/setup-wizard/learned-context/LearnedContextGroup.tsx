import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type LearnedContextItem, type LearnedGroupConfig } from './learned-context';
import * as styles from './learned-context.styles';
import { LearnedContextAddForm } from './LearnedContextAddForm';
import { LearnedContextChip } from './LearnedContextChip';

/** Keeps each group scannable; the rest sit behind "show more". */
export const INITIAL_VISIBLE_ITEMS = 6;

interface LearnedContextGroupProps {
  group: LearnedGroupConfig;
  items: LearnedContextItem[];
  onAdd: (contextKey: string, contextValue: string) => void;
  onUpdate: (contextId: string, contextValue: string) => void;
  onRemove: (contextId: string) => void;
}

export const LearnedContextGroup: React.FC<LearnedContextGroupProps> = ({ group, items, onAdd, onUpdate, onRemove }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const visibleItems = isExpanded ? items : items.slice(0, INITIAL_VISIBLE_ITEMS);
  const hiddenCount = items.length - visibleItems.length;
  const canCollapse = isExpanded && items.length > INITIAL_VISIBLE_ITEMS;
  const groupKey = `setupWizard.learned.groups.${group.id}`;

  const handleAdd = (contextKey: string, contextValue: string) => {
    onAdd(contextKey, contextValue);
    setIsAdding(false);
  };

  return (
    <section aria-labelledby={titleId} style={styles.groupCardStyle} data-testid={`learned-group-${group.id}`}>
      <header style={styles.groupHeaderStyle}>
        <span aria-hidden style={styles.groupIconStyle}>
          {group.icon}
        </span>
        <h3 id={titleId} style={styles.groupTitleStyle}>
          {t(`${groupKey}.title`)}
        </h3>
        <span style={styles.groupCountStyle}>{items.length}</span>
      </header>

      {items.length === 0 && <p style={styles.emptyTextStyle}>{t(`${groupKey}.empty`)}</p>}

      {visibleItems.length > 0 && (
        <ul style={styles.chipListStyle}>
          {visibleItems.map(item => (
            <LearnedContextChip
              key={item.clientKey ?? item.contextId}
              item={item}
              showKind={group.keys.length > 1}
              onSave={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {isAdding ? (
        <div style={styles.groupFooterStyle}>
          <LearnedContextAddForm keys={group.keys} onSubmit={handleAdd} onCancel={() => setIsAdding(false)} />
        </div>
      ) : (
        <div style={styles.groupFooterStyle}>
          <button type="button" onClick={() => setIsAdding(true)} style={styles.linkButtonStyle}>
            + {t(`${groupKey}.add`)}
          </button>
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setIsExpanded(true)} style={styles.linkButtonStyle}>
              {t('setupWizard.learned.showMore', { count: hiddenCount })}
            </button>
          )}
          {canCollapse && (
            <button type="button" onClick={() => setIsExpanded(false)} style={styles.linkButtonStyle}>
              {t('setupWizard.learned.showLess')}
            </button>
          )}
        </div>
      )}
    </section>
  );
};
