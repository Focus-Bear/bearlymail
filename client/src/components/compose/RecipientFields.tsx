/* eslint-disable max-lines-per-function */
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { RecipientSuggestion } from 'types/contactGroup';
import { isValidEmail, parseRecipientString } from 'utils/recipientParser';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { AVATAR_SIZE_SMALL_PX, DEFAULT_AVATAR_SIZE_PX, FONT_SIZE_MD_PX, FONT_SIZE_XS_PX } from 'constants/numbers';
import {
  EMAIL_FIELD_BCC,
  EMAIL_FIELD_CC,
  EMAIL_FIELD_TO,
  KEY_COMMA,
  KEY_ENTER,
  STRING_NONE,
  SUGGESTION_KIND_GROUP,
} from 'constants/strings';

interface Recipient {
  email: string;
  name?: string;
}

type FieldType = typeof EMAIL_FIELD_TO | typeof EMAIL_FIELD_CC | typeof EMAIL_FIELD_BCC;

interface RecipientFieldsProps {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  showCc: boolean;
  showBcc: boolean;
  activeField: FieldType | null;
  searchQuery: string;
  searchResults: Contact[];
  /** When provided, shown instead of (and superseding) the plain searchResults list. */
  recipientSuggestions?: RecipientSuggestion[];
  onAddRecipient: (contact: Contact | { email: string; name?: string }, field: FieldType) => void;
  onRemoveRecipient: (email: string, field: FieldType) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onSetActiveField: (field: FieldType | null) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSearchResult: (contact: Contact) => void;
}

export const RecipientFields: React.FC<RecipientFieldsProps> = ({
  to,
  cc,
  bcc,
  showCc,
  showBcc,
  activeField,
  searchQuery,
  searchResults,
  recipientSuggestions,
  onAddRecipient,
  onRemoveRecipient,
  onShowCc,
  onShowBcc,
  onSetActiveField,
  onSearchQueryChange,
  onSelectSearchResult,
}) => {
  const { t } = useTranslation();

  // ── Drag-and-drop state ─────────────────────────────────────────────────────
  const [dragSource, setDragSource] = useState<{ field: FieldType; email: string } | null>(null);
  const [dragOverField, setDragOverField] = useState<FieldType | null>(null);
  const inputRefs = useRef<Partial<Record<FieldType, HTMLInputElement | null>>>({});

  // Clicking a chip turns it back into editable text in the field's input.
  const handleEditRecipient = (recipient: Recipient, field: FieldType) => {
    onRemoveRecipient(recipient.email, field);
    onSetActiveField(field);
    onSearchQueryChange(recipient.email);
    requestAnimationFrame(() => inputRefs.current[field]?.focus());
  };

  const getRecipients = (field: FieldType): Recipient[] => {
    if (field === EMAIL_FIELD_TO) {
      return to;
    }
    if (field === EMAIL_FIELD_CC) {
      return cc;
    }
    return bcc;
  };

  const handleDragStart = (field: FieldType, email: string, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    setDragSource({ field, email });
  };

  const handleDrop = (targetField: FieldType, event: React.DragEvent) => {
    event.preventDefault();
    setDragOverField(null);
    if (!dragSource || dragSource.field === targetField) {
      setDragSource(null);
      return;
    }
    const sourceRecipients = getRecipients(dragSource.field);
    const moved = sourceRecipients.find(recipient => recipient.email === dragSource.email);
    if (!moved) {
      setDragSource(null);
      return;
    }
    onRemoveRecipient(dragSource.email, dragSource.field);
    onAddRecipient(moved, targetField);
    setDragSource(null);
  };

  const renderRecipientField = (label: string, recipients: Recipient[], field: FieldType, isActive: boolean) => {
    const isDragOver = dragOverField === field;

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${FONT_SIZE_XS_PX}px`,
          padding: '8px 0',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          marginBottom: `${FONT_SIZE_MD_PX}px`,
          flexWrap: 'wrap',
        }}
      >
        <label
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            minWidth: `${DEFAULT_AVATAR_SIZE_PX}px`,
          }}
        >
          {label}
        </label>
        <div
          onDragOver={event => {
            event.preventDefault();
            setDragOverField(field);
          }}
          onDragLeave={() => setDragOverField(null)}
          onDrop={event => handleDrop(field, event)}
          style={{
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            position: 'relative',
            padding: '2px 4px',
            border: isDragOver ? `2px dashed ${theme.colors.primary.main}` : '2px solid transparent',
            borderRadius: theme.borderRadius.sm,
            backgroundColor: isDragOver ? theme.colors.primary.subtle : undefined,
            transition: 'border-color 0.15s, background-color 0.15s',
          }}
        >
          {recipients.map(recipient => (
            <div
              key={recipient.email}
              draggable
              onDragStart={event => handleDragStart(field, recipient.email, event)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: theme.colors.primary.subtle,
                borderRadius: theme.borderRadius.full,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'grab',
              }}
            >
              <span
                onClick={() => handleEditRecipient(recipient, field)}
                title={t('compose.editRecipient')}
                style={{ color: theme.colors.text.primary, cursor: 'pointer' }}
              >
                {recipient.name || recipient.email}
              </span>
              <button
                onClick={() => onRemoveRecipient(recipient.email, field)}
                style={{
                  background: STRING_NONE,
                  border: STRING_NONE,
                  cursor: 'pointer',
                  color: theme.colors.text.secondary,
                  fontSize: '14px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ×
              </button>
            </div>
          ))}
          <input
            ref={el => {
              inputRefs.current[field] = el;
            }}
            type="text"
            value={isActive ? searchQuery : ''}
            onChange={event => {
              onSetActiveField(field);
              onSearchQueryChange(event.target.value);
            }}
            onFocus={() => onSetActiveField(field)}
            onBlur={() => {
              const value = searchQuery.trim();
              if (value && isValidEmail(value)) {
                onAddRecipient({ email: value }, field);
                onSearchQueryChange('');
              }
              onSetActiveField(null);
            }}
            onPaste={event => {
              const raw = event.clipboardData.getData('text');
              const parsed = parseRecipientString(raw);
              if (parsed.length > 0) {
                event.preventDefault();
                parsed.forEach(recipient => onAddRecipient(recipient, field));
                onSearchQueryChange('');
              }
              // If nothing valid was parsed, fall through to default paste behaviour
            }}
            onKeyDown={event => {
              if ((event.key === KEY_ENTER || event.key === KEY_COMMA) && searchQuery.trim()) {
                event.preventDefault();
                const value = searchQuery.trim().replace(/,$/, '');
                if (isValidEmail(value)) {
                  onAddRecipient({ email: value }, field);
                  onSearchQueryChange('');
                }
              }
            }}
            placeholder={t('compose.recipientPlaceholder')}
            style={{
              flex: 1,
              minWidth: '150px',
              border: STRING_NONE,
              outline: 'none',
              padding: '4px 0',
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
              backgroundColor: COLOR_TRANSPARENT,
            }}
          />
          {isActive && (recipientSuggestions ? recipientSuggestions.length > 0 : searchResults.length > 0) && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                backgroundColor: theme.colors.background.paper,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.lg,
                zIndex: 1000,
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              {recipientSuggestions
                ? recipientSuggestions.map(suggestion => {
                    if (suggestion.kind === SUGGESTION_KIND_GROUP) {
                      const { group } = suggestion;
                      return (
                        <div
                          key={`group-${group.id}`}
                          onMouseDown={event => event.preventDefault()}
                          onTouchStart={event => event.preventDefault()}
                          onClick={() => {
                            group.members.forEach(member => {
                              onAddRecipient({ email: member.email, name: member.name }, field);
                            });
                            onSearchQueryChange('');
                          }}
                          style={{
                            padding: `8px ${FONT_SIZE_XS_PX}px`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderBottom: `1px solid ${theme.colors.border.light}`,
                            backgroundColor: theme.colors.background.subtle,
                          }}
                          onMouseEnter={event => {
                            event.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
                          }}
                          onMouseLeave={event => {
                            event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                          }}
                        >
                          <div
                            style={{
                              width: `${AVATAR_SIZE_SMALL_PX}px`,
                              height: `${AVATAR_SIZE_SMALL_PX}px`,
                              borderRadius: '50%',
                              backgroundColor: theme.colors.primary.main,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: theme.colors.common.white,
                              fontSize: `${FONT_SIZE_XS_PX}px`,
                              fontWeight: theme.typography.fontWeight.semibold,
                              flexShrink: 0,
                            }}
                          >
                            👥
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: theme.typography.fontSize.sm,
                                color: theme.colors.text.primary,
                                fontWeight: theme.typography.fontWeight.medium,
                              }}
                            >
                              {group.name}
                            </div>
                            <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                              {t('settings.contactGroups.memberCount', { count: group.memberCount })}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // contact suggestion
                    const { contact } = suggestion;
                    return (
                      <div
                        key={contact.id || contact.email}
                        onMouseDown={event => event.preventDefault()}
                        onTouchStart={event => event.preventDefault()}
                        onClick={() => onSelectSearchResult(contact)}
                        style={{
                          padding: `8px ${FONT_SIZE_XS_PX}px`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderBottom: `1px solid ${theme.colors.border.light}`,
                        }}
                        onMouseEnter={event => {
                          event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                        }}
                        onMouseLeave={event => {
                          event.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
                        }}
                      >
                        {contact.photoUrl ? (
                          <img
                            src={contact.photoUrl}
                            alt=""
                            style={{
                              width: `${AVATAR_SIZE_SMALL_PX}px`,
                              height: `${AVATAR_SIZE_SMALL_PX}px`,
                              borderRadius: '50%',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: `${AVATAR_SIZE_SMALL_PX}px`,
                              height: `${AVATAR_SIZE_SMALL_PX}px`,
                              borderRadius: '50%',
                              backgroundColor: theme.colors.primary.subtle,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: theme.colors.primary.main,
                              fontSize: `${FONT_SIZE_XS_PX}px`,
                              fontWeight: theme.typography.fontWeight.semibold,
                            }}
                          >
                            {(contact.name || contact.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
                            {contact.name || contact.email}
                          </div>
                          {contact.name && (
                            <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                              {contact.email}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                : searchResults.map(contact => (
                    <div
                      key={contact.id || contact.email}
                      onMouseDown={event => event.preventDefault()}
                      onTouchStart={event => event.preventDefault()}
                      onClick={() => onSelectSearchResult(contact)}
                      style={{
                        padding: `8px ${FONT_SIZE_XS_PX}px`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: `1px solid ${theme.colors.border.light}`,
                      }}
                      onMouseEnter={event => {
                        event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                      }}
                      onMouseLeave={event => {
                        event.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
                      }}
                    >
                      {contact.photoUrl ? (
                        <img
                          src={contact.photoUrl}
                          alt=""
                          style={{
                            width: `${AVATAR_SIZE_SMALL_PX}px`,
                            height: `${AVATAR_SIZE_SMALL_PX}px`,
                            borderRadius: '50%',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: `${AVATAR_SIZE_SMALL_PX}px`,
                            height: `${AVATAR_SIZE_SMALL_PX}px`,
                            borderRadius: '50%',
                            backgroundColor: theme.colors.primary.subtle,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme.colors.primary.main,
                            fontSize: `${FONT_SIZE_XS_PX}px`,
                            fontWeight: theme.typography.fontWeight.semibold,
                          }}
                        >
                          {(contact.name || contact.email)[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
                          {contact.name || contact.email}
                        </div>
                        {contact.name && (
                          <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                            {contact.email}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      {renderRecipientField(t('compose.to'), to, EMAIL_FIELD_TO, activeField === EMAIL_FIELD_TO)}
      {showCc && renderRecipientField(t('compose.cc'), cc, EMAIL_FIELD_CC, activeField === EMAIL_FIELD_CC)}
      {showBcc && renderRecipientField(t('compose.bcc'), bcc, EMAIL_FIELD_BCC, activeField === EMAIL_FIELD_BCC)}
      {!showCc && (
        <button
          onClick={onShowCc}
          style={{
            background: STRING_NONE,
            border: STRING_NONE,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            padding: '4px 0',
            marginBottom: `${FONT_SIZE_XS_PX}px`,
          }}
        >
          + {t('compose.addCc')}
        </button>
      )}
      {!showBcc && (
        <button
          onClick={onShowBcc}
          style={{
            background: STRING_NONE,
            border: STRING_NONE,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            padding: '4px 0',
            marginBottom: `${FONT_SIZE_XS_PX}px`,
          }}
        >
          + {t('compose.addBcc')}
        </button>
      )}
    </div>
  );
};
