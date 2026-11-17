import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { ContactGroup } from 'types/contactGroup';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { EMAIL_FIELD_BCC, EMAIL_FIELD_CC, EMAIL_FIELD_TO, STRING_NONE } from 'constants/strings';

import RecipientChip, { RECIPIENT_CHIP_EDIT_ATTRIBUTE } from './RecipientChip';
import RecipientSuggestions from './RecipientSuggestions';
import { useRecipients } from './useRecipients';

interface ReplyRecipientsInputProps {
  replyRecipients: string;
  replyCc: string;
  replyBcc: string;
  showCc: boolean;
  showBcc: boolean;
  onRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
}

type FieldType = typeof EMAIL_FIELD_TO | typeof EMAIL_FIELD_CC | typeof EMAIL_FIELD_BCC;

interface RecipientFieldProps {
  label: string;
  tags: string[];
  field: FieldType;
  activeField: FieldType | null;
  setActiveField: (f: FieldType) => void;
  searchResults: Contact[];
  recipientSuggestions: import('types/contactGroup').RecipientSuggestion[];
  selectedSuggestionIndex: number;
  inputValues: Record<FieldType, string>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  handleInputChange: (value: string, field: FieldType) => void;
  handleKeyDown: (
    event: React.KeyboardEvent,
    field: FieldType,
    idx: number,
    removeTag: (i: number, f: FieldType) => void
  ) => void;
  handleSelectContact: (contact: Contact, field: FieldType) => void;
  handleSelectGroup: (group: ContactGroup, field: FieldType) => void;
  handleRemoveTag: (i: number, field: FieldType) => void;
  handleReplaceTag: (i: number, field: FieldType, editedValue: string) => boolean;
  handleBlur: (field: FieldType) => void;
  setSelectedSuggestionIndex: (idx: number) => void;
  /** Drag-and-drop */
  isDragOver: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onChipDragStart: (index: number, event: React.DragEvent) => void;
  t: (tKey: string) => string;
}

interface RecipientChipListProps {
  tags: string[];
  field: FieldType;
  handleRemoveTag: (i: number, field: FieldType) => void;
  handleReplaceTag: (i: number, field: FieldType, editedValue: string) => boolean;
  onChipDragStart: (index: number, event: React.DragEvent) => void;
  /** Where focus goes when the edited chip no longer exists (cleared, or split into others). */
  focusFieldInput: () => void;
}

// Owns which chip is being edited, and puts keyboard focus back on that chip once the edit ends.
const RecipientChipList: React.FC<RecipientChipListProps> = ({
  tags,
  field,
  handleRemoveTag,
  handleReplaceTag,
  onChipDragStart,
  focusFieldInput,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLSpanElement>(null);

  const focusChip = (index: number) =>
    requestAnimationFrame(() => {
      const chipButtons = listRef.current?.querySelectorAll<HTMLButtonElement>(`[${RECIPIENT_CHIP_EDIT_ATTRIBUTE}]`);
      const chipButton = chipButtons?.[index];
      if (chipButton) {
        chipButton.focus();
        return;
      }
      focusFieldInput();
    });

  const handleEditEnd = (index: number, shouldRestoreFocus: boolean) => {
    setEditingIndex(null);
    if (shouldRestoreFocus) {
      focusChip(index);
    }
  };

  return (
    <span ref={listRef} style={{ display: 'contents' }}>
      {tags.map((tag, index) => (
        <RecipientChip
          key={tag}
          tag={tag}
          index={index}
          onRemove={i => handleRemoveTag(i, field)}
          draggable={editingIndex !== index}
          onDragStart={event => onChipDragStart(index, event)}
          isEditing={editingIndex === index}
          onStartEdit={setEditingIndex}
          onCommitEdit={(i, editedValue) => handleReplaceTag(i, field, editedValue)}
          onEditEnd={handleEditEnd}
        />
      ))}
    </span>
  );
};

const RecipientField: React.FC<RecipientFieldProps> = ({
  label,
  tags,
  field,
  activeField,
  setActiveField,
  searchResults,
  recipientSuggestions,
  selectedSuggestionIndex,
  inputValues,
  dropdownRef,
  handleInputChange,
  handleKeyDown,
  handleSelectContact,
  handleSelectGroup,
  handleRemoveTag,
  handleReplaceTag,
  handleBlur,
  setSelectedSuggestionIndex,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onChipDragStart,
  t,
}) => {
  const fieldInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ marginBottom: theme.spacing.sm, position: 'relative' }}>
      <label
        style={{
          display: 'block',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}:
      </label>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          border: isDragOver ? `2px dashed ${theme.colors.primary.main}` : `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          minHeight: '38px',
          cursor: 'text',
          backgroundColor: isDragOver ? theme.colors.primary.subtle : undefined,
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onClick={() => fieldInputRef.current?.focus()}
      >
        <RecipientChipList
          tags={tags}
          field={field}
          handleRemoveTag={handleRemoveTag}
          handleReplaceTag={handleReplaceTag}
          onChipDragStart={onChipDragStart}
          focusFieldInput={() => fieldInputRef.current?.focus()}
        />
        <input
          ref={fieldInputRef}
          type="text"
          value={inputValues[field]}
          onChange={event => handleInputChange(event.target.value, field)}
          onFocus={() => setActiveField(field)}
          onBlur={() => handleBlur(field)}
          onKeyDown={event =>
            handleKeyDown(event as unknown as React.KeyboardEvent, field, selectedSuggestionIndex, handleRemoveTag)
          }
          style={{
            flex: 1,
            minWidth: '120px',
            border: STRING_NONE,
            outline: 'none',
            fontSize: theme.typography.fontSize.sm,
            padding: '4px 0',
            backgroundColor: COLOR_TRANSPARENT,
          }}
          placeholder={tags.length === 0 ? t('compose.recipientPlaceholder') : ''}
        />
      </div>

      {activeField === field && recipientSuggestions.length > 0 && (
        <RecipientSuggestions
          suggestions={recipientSuggestions}
          contacts={searchResults}
          selectedIndex={selectedSuggestionIndex}
          onSelect={(contact: Contact) => handleSelectContact(contact, field)}
          onSelectGroup={(group: ContactGroup) => handleSelectGroup(group, field)}
          onHover={(idx: number) => setSelectedSuggestionIndex(idx)}
          dropdownRef={dropdownRef}
          field={field}
        />
      )}
    </div>
  );
};

export const ReplyRecipientsInput: React.FC<ReplyRecipientsInputProps> = ({
  replyRecipients,
  replyCc,
  replyBcc,
  showCc,
  showBcc,
  onRecipientsChange,
  onCcChange,
  onBccChange,
  onShowCc,
  onShowBcc,
}) => {
  const { t } = useTranslation();

  const {
    toTags,
    ccTags,
    bccTags,
    activeField,
    setActiveField,
    searchResults,
    recipientSuggestions,
    selectedSuggestionIndex,
    inputValues,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleSelectContact,
    handleSelectGroup,
    handleRemoveTag,
    handleReplaceTag,
    handleBlur,
    setSelectedSuggestionIndex,
    handleDragStart,
    handleDrop,
  } = useRecipients({ replyRecipients, replyCc, replyBcc, onRecipientsChange, onCcChange, onBccChange });

  // Track which field container is currently being dragged over
  const [dragOverField, setDragOverField] = useState<FieldType | null>(null);

  const makeDropHandlers = (field: FieldType) => ({
    isDragOver: dragOverField === field,
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setDragOverField(field);
    },
    onDragLeave: () => setDragOverField(null),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragOverField(null);
      handleDrop(field);
    },
    onChipDragStart: (index: number, event: React.DragEvent) => {
      // Set drag data so the browser shows a ghost; the real state is in handleDragStart
      event.dataTransfer.effectAllowed = 'move';
      handleDragStart(field, index);
    },
  });

  const baseFieldProps = {
    activeField,
    setActiveField,
    searchResults,
    recipientSuggestions,
    selectedSuggestionIndex,
    inputValues,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleSelectContact,
    handleSelectGroup,
    handleRemoveTag,
    handleReplaceTag,
    handleBlur,
    setSelectedSuggestionIndex,
    t,
  };

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <RecipientField
        label={t('compose.to')}
        tags={toTags}
        field={EMAIL_FIELD_TO}
        {...baseFieldProps}
        {...makeDropHandlers(EMAIL_FIELD_TO)}
      />
      {showCc && (
        <RecipientField
          label={t('compose.cc')}
          tags={ccTags}
          field={EMAIL_FIELD_CC}
          {...baseFieldProps}
          {...makeDropHandlers(EMAIL_FIELD_CC)}
        />
      )}
      {showBcc && (
        <RecipientField
          label={t('compose.bcc')}
          tags={bccTags}
          field={EMAIL_FIELD_BCC}
          {...baseFieldProps}
          {...makeDropHandlers(EMAIL_FIELD_BCC)}
        />
      )}

      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {!showCc && (
          <button
            onClick={onShowCc}
            type="button"
            style={{
              background: STRING_NONE,
              border: STRING_NONE,
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              padding: '4px 0',
            }}
          >
            + {t('compose.addCc')}
          </button>
        )}
        {!showBcc && (
          <button
            onClick={onShowBcc}
            type="button"
            style={{
              background: STRING_NONE,
              border: STRING_NONE,
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              padding: '4px 0',
            }}
          >
            + {t('compose.addBcc')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ReplyRecipientsInput;
