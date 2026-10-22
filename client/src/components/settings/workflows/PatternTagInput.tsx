import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const ENTER_KEY = 'Enter';
const COMMA_KEY = ',';

export interface PatternTagInputProps {
  patterns: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}

/**
 * A list of pattern chips with an input to add more (Enter or comma adds).
 * Shared by the workflow condition builder and the auto-archive proposal editor.
 */
export const PatternTagInput: React.FC<PatternTagInputProps> = ({
  patterns,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
}) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
      {patterns.map((pattern, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: theme.colors.background.subtle,
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
          }}
        >
          <code style={{ fontSize: 12 }}>{pattern}</code>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            aria-label={t('common.remove')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="text"
        value={inputValue}
        onChange={evt => onInputChange(evt.target.value)}
        onKeyDown={evt => {
          if (evt.key === ENTER_KEY || evt.key === COMMA_KEY) {
            evt.preventDefault();
            onAdd(inputValue);
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${theme.colors.border.default}`,
          fontSize: 13,
        }}
      />
      <button
        type="button"
        onClick={() => onAdd(inputValue)}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: `1px solid ${theme.colors.border.default}`,
          background: theme.colors.background.paper,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        {t('common.add')}
      </button>
    </div>
  </div>
  );
};
