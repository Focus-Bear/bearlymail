import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatRecipientLabel } from 'utils/recipientParser';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

/** Marks each chip's edit button so the chip list can move focus back to it after an edit. */
export const RECIPIENT_CHIP_EDIT_ATTRIBUTE = 'data-recipient-chip-edit';

/** Long enough that a typical "Name <address>" fits without scrolling inside the editor. */
const EDITOR_MIN_SIZE_CHARS = 24;

interface RecipientChipEditorProps {
  initialValue: string;
  /** Applies the edit; returns false when the text is not a valid address list. */
  onCommit: (editedValue: string) => boolean;
  /** Leaves edit mode; `shouldRestoreFocus` is true when the edit ended from the keyboard. */
  onEditEnd: (shouldRestoreFocus: boolean) => void;
}

const RecipientChipEditor: React.FC<RecipientChipEditorProps> = ({ initialValue, onCommit, onEditEnd }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [isInvalid, setIsInvalid] = useState(false);
  // Enter/Escape end the edit and unmount the editor; a blur fired during that unmount must not commit again.
  const isSettledRef = useRef(false);

  const settle = (shouldRestoreFocus: boolean) => {
    isSettledRef.current = true;
    onEditEnd(shouldRestoreFocus);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== KEY_ENTER && event.key !== KEY_ESCAPE) {
      return;
    }
    // Keep the composer's own Enter/Escape shortcuts from also firing.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === KEY_ESCAPE) {
      settle(true);
      return;
    }
    if (onCommit(value)) {
      settle(true);
      return;
    }
    setIsInvalid(true);
  };

  // Clicking away keeps a valid edit; an invalid one falls back to the original address.
  const handleBlur = () => {
    if (isSettledRef.current) {
      return;
    }
    onCommit(value);
    settle(false);
  };

  return (
    <input
      type="text"
      autoFocus
      value={value}
      size={Math.max(value.length, EDITOR_MIN_SIZE_CHARS)}
      aria-label={t('compose.editRecipientInputLabel')}
      aria-invalid={isInvalid}
      onChange={event => {
        setValue(event.target.value);
        setIsInvalid(false);
      }}
      onFocus={event => event.target.select()}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={event => event.stopPropagation()}
      style={{
        maxWidth: '100%',
        padding: '2px 6px',
        border: `1px solid ${isInvalid ? theme.colors.error.main : theme.colors.primary.main}`,
        borderRadius: theme.borderRadius.sm,
        outline: STRING_NONE,
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.primary,
        backgroundColor: COLOR_TRANSPARENT,
      }}
    />
  );
};

interface RecipientChipProps {
  tag: string;
  index: number;
  onRemove: (index: number) => void;
  /** When true the chip can be dragged to another recipient field */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  /** When true the chip renders as an editable text field pre-filled with the full address. */
  isEditing: boolean;
  onStartEdit: (index: number) => void;
  onCommitEdit: (index: number, editedValue: string) => boolean;
  onEditEnd: (index: number, shouldRestoreFocus: boolean) => void;
}

export const RecipientChip: React.FC<RecipientChipProps> = ({
  tag,
  index,
  onRemove,
  draggable = false,
  onDragStart,
  isEditing,
  onStartEdit,
  onCommitEdit,
  onEditEnd,
}) => {
  const { t } = useTranslation();

  if (isEditing) {
    return (
      <RecipientChipEditor
        initialValue={tag}
        onCommit={editedValue => onCommitEdit(index, editedValue)}
        onEditEnd={shouldRestoreFocus => onEditEnd(index, shouldRestoreFocus)}
      />
    );
  }

  const label = formatRecipientLabel(tag);

  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        backgroundColor: theme.colors.primary.subtle,
        color: theme.colors.primary.main,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.xs,
        maxWidth: '200px',
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      <button
        type="button"
        {...{ [RECIPIENT_CHIP_EDIT_ATTRIBUTE]: true }}
        title={`${label} — ${t('compose.editRecipient')}`}
        aria-label={t('compose.editRecipientLabel', { recipient: label })}
        onClick={event => {
          event.stopPropagation();
          onStartEdit(index);
        }}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: STRING_NONE,
          border: STRING_NONE,
          padding: 0,
          font: 'inherit',
          color: theme.colors.primary.main,
          cursor: 'text',
        }}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={t('compose.removeRecipientLabel', { recipient: label })}
        onClick={event => {
          event.stopPropagation();
          onRemove(index);
        }}
        style={{
          background: STRING_NONE,
          border: STRING_NONE,
          padding: 0,
          cursor: 'pointer',
          color: theme.colors.primary.main,
          fontSize: '14px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        &times;
      </button>
    </span>
  );
};

export default RecipientChip;
