import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as styles from './learned-context.styles';

const KEY_ESCAPE = 'Escape';

interface LearnedContextAddFormProps {
  /** Context keys the new item can be filed under; the first is the default. */
  keys: readonly string[];
  onSubmit: (contextKey: string, contextValue: string) => void;
  onCancel: () => void;
}

/** Inline "add an item" row; offers a kind picker only when the group mixes several keys. */
export const LearnedContextAddForm: React.FC<LearnedContextAddFormProps> = ({ keys, onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const [contextKey, setContextKey] = useState(keys[0]);
  const [draft, setDraft] = useState('');
  const canSubmit = Boolean(draft.trim());

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canSubmit) {
      onSubmit(contextKey, draft.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ESCAPE) {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} style={styles.editRowStyle}>
      {keys.length > 1 && (
        <select
          value={contextKey}
          onChange={event => setContextKey(event.target.value)}
          aria-label={t('setupWizard.learned.kindLabel')}
          style={styles.selectStyle}
        >
          {keys.map(key => (
            <option key={key} value={key}>
              {t(`setupWizard.learned.kinds.${key}`)}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder={t(`setupWizard.learned.placeholders.${contextKey}`)}
        aria-label={t(`setupWizard.learned.placeholders.${contextKey}`)}
        style={styles.textInputStyle}
      />
      <button type="submit" disabled={!canSubmit} style={styles.smallPrimaryButtonStyle(canSubmit)}>
        {t('setupWizard.learned.add')}
      </button>
      <button type="button" onClick={onCancel} style={styles.smallGhostButtonStyle}>
        {t('common.cancel')}
      </button>
    </form>
  );
};
