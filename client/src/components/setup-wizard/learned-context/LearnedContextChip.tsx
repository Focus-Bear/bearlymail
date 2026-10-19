import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { joinContextValue, type LearnedContextItem, splitContextValue } from './learned-context';
import * as styles from './learned-context.styles';
import { isPendingContextId } from './useLearnedContext';

const KEY_ENTER = 'Enter';
const KEY_ESCAPE = 'Escape';

interface LearnedContextChipProps {
  item: LearnedContextItem;
  /** Show the item's kind (Goal / VIP / Urgent) when a group mixes several. */
  showKind: boolean;
  onSave: (contextId: string, contextValue: string) => void;
  onRemove: (contextId: string) => void;
}

/** One learned item: a compact chip that turns into an inline text field to rename it. */
export const LearnedContextChip: React.FC<LearnedContextChipProps> = ({ item, showKind, onSave, onRemove }) => {
  const { t } = useTranslation();
  const { label, detail } = splitContextValue(item);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const isPending = isPendingContextId(item.contextId);

  const startEditing = () => {
    setDraft(label);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    if (draft.trim()) {
      onSave(item.contextId, joinContextValue(draft, detail));
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      commit();
    } else if (event.key === KEY_ESCAPE) {
      event.stopPropagation();
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <li style={styles.editRowStyle}>
        <input
          autoFocus
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('setupWizard.learned.editLabel', { label })}
          style={styles.textInputStyle}
        />
        <button type="button" onClick={commit} style={styles.smallPrimaryButtonStyle(Boolean(draft.trim()))}>
          {t('setupWizard.learned.save')}
        </button>
        <button type="button" onClick={() => setIsEditing(false)} style={styles.smallGhostButtonStyle}>
          {t('common.cancel')}
        </button>
      </li>
    );
  }

  return (
    <li style={styles.chipStyle(isPending)} title={detail ? `${label} — ${detail}` : label}>
      {showKind && <span style={styles.kindTagStyle}>{t(`setupWizard.learned.kinds.${item.contextKey}`)}</span>}
      <span style={styles.chipLabelStyle}>{label}</span>
      <button
        type="button"
        onClick={startEditing}
        disabled={isPending}
        aria-label={t('setupWizard.learned.editLabel', { label })}
        style={styles.iconButtonStyle}
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.contextId)}
        disabled={isPending}
        aria-label={t('setupWizard.learned.removeLabel', { label })}
        style={styles.iconButtonStyle}
      >
        <CrossIcon />
      </button>
    </li>
  );
};

const PencilIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

const CrossIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
