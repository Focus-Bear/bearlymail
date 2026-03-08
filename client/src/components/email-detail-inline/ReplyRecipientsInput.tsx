import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';

import { EMAIL_FIELD_BCC, EMAIL_FIELD_CC, EMAIL_FIELD_TO, STRING_NONE } from 'constants/strings';

import RecipientChip from './RecipientChip';
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
  selectedSuggestionIndex: number;
  inputValues: Record<FieldType, string>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  handleInputChange: (value: string, field: FieldType) => void;
  handleKeyDown: (
    event: React.KeyboardEvent,
    field: FieldType,
    results: Contact[],
    idx: number,
    removeTag: (i: number, f: FieldType) => void
  ) => void;
  handleSelectContact: (contact: Contact, field: FieldType) => void;
  handleRemoveTag: (i: number, field: FieldType) => void;
  handleBlur: (field: FieldType) => void;
  setSelectedSuggestionIndex: (idx: number) => void;
  t: (tKey: string) => string;
}

const RecipientField: React.FC<RecipientFieldProps> = ({
  label,
  tags,
  field,
  activeField,
  setActiveField,
  searchResults,
  selectedSuggestionIndex,
  inputValues,
  dropdownRef,
  handleInputChange,
  handleKeyDown,
  handleSelectContact,
  handleRemoveTag,
  handleBlur,
  setSelectedSuggestionIndex,
  t,
}) => (
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
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        minHeight: '38px',
        cursor: 'text',
      }}
      onClick={event => {
        const input = event.currentTarget.querySelector('input');
        if (input) {
          (input as HTMLInputElement).focus();
        }
      }}
    >
      {tags.map((tag, index) => (
        <RecipientChip key={tag} tag={tag} index={index} onRemove={i => handleRemoveTag(i, field)} />
      ))}
      <input
        type="text"
        value={inputValues[field]}
        onChange={event => handleInputChange(event.target.value, field)}
        onFocus={() => setActiveField(field)}
        onBlur={() => handleBlur(field)}
        onKeyDown={event =>
          handleKeyDown(
            event as unknown as React.KeyboardEvent,
            field,
            searchResults,
            selectedSuggestionIndex,
            handleRemoveTag
          )
        }
        style={{
          flex: 1,
          minWidth: '120px',
          border: STRING_NONE,
          outline: 'none',
          fontSize: theme.typography.fontSize.sm,
          padding: '4px 0',
        }}
        placeholder={tags.length === 0 ? t('compose.recipientPlaceholder') : ''}
      />
    </div>

    {activeField === field && searchResults.length > 0 && (
      <RecipientSuggestions
        contacts={searchResults}
        selectedIndex={selectedSuggestionIndex}
        onSelect={(contact: Contact) => handleSelectContact(contact, field)}
        onHover={(idx: number) => setSelectedSuggestionIndex(idx)}
        dropdownRef={dropdownRef}
        field={field}
      />
    )}
  </div>
);

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
    selectedSuggestionIndex,
    inputValues,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleSelectContact,
    handleRemoveTag,
    handleBlur,
    setSelectedSuggestionIndex,
  } = useRecipients({ replyRecipients, replyCc, replyBcc, onRecipientsChange, onCcChange, onBccChange });

  const fieldProps = {
    activeField,
    setActiveField,
    searchResults,
    selectedSuggestionIndex,
    inputValues,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleSelectContact,
    handleRemoveTag,
    handleBlur,
    setSelectedSuggestionIndex,
    t,
  };

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <RecipientField label={t('compose.to')} tags={toTags} field={EMAIL_FIELD_TO} {...fieldProps} />
      {showCc && <RecipientField label={t('compose.cc')} tags={ccTags} field={EMAIL_FIELD_CC} {...fieldProps} />}
      {showBcc && <RecipientField label={t('compose.bcc')} tags={bccTags} field={EMAIL_FIELD_BCC} {...fieldProps} />}

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
