import React, { useCallback, useEffect, useMemo,useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';

import { API_URL } from 'config/api';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { EMAIL_FIELD_BCC, EMAIL_FIELD_CC, EMAIL_FIELD_TO, KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

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

const parseEmailsToTags = (value: string): string[] => {
  return value
    .split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const extractedEmail = email.match(/<([^>]+)>/)?.[1] || email;
  return emailRegex.test(extractedEmail.trim());
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
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [inputValues, setInputValues] = useState<Record<FieldType, string>>({ [EMAIL_FIELD_TO]: '', [EMAIL_FIELD_CC]: '', [EMAIL_FIELD_BCC]: '' });
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toTags = useMemo(() => parseEmailsToTags(replyRecipients), [replyRecipients]);
  const ccTags = useMemo(() => parseEmailsToTags(replyCc), [replyCc]);
  const bccTags = useMemo(() => parseEmailsToTags(replyBcc), [replyBcc]);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      setSearchResults(response.data);
      setSelectedSuggestionIndex(-1);
    } catch (err) {
      console.error('Contact search failed:', err);
      setSearchResults([]);
    }
  }, []);

  const handleRemoveTag = useCallback((index: number, field: FieldType) => {
    const getTags = () => {
      if (field === EMAIL_FIELD_TO) return toTags;
      if (field === EMAIL_FIELD_CC) return ccTags;
      return bccTags;
    };

    const tags = getTags();
    const newTags = tags.filter((_, i) => i !== index);
    const newValue = newTags.join(', ');

    if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
    else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
    else onBccChange(newValue);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]);

  const handleInputChange = useCallback((value: string, field: FieldType) => {
    setInputValues(prev => ({ ...prev, [field]: value }));
    setActiveField(field);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.includes(',')) {
      const parts = value.split(',');
      const newEmails = parts.slice(0, -1).map(e => e.trim()).filter(e => e.length > 0 && !/[\r\n]/.test(e) && isValidEmail(e));
      const remaining = parts[parts.length - 1];

      if (newEmails.length > 0) {
        const getTags = () => {
          if (field === EMAIL_FIELD_TO) return toTags;
          if (field === EMAIL_FIELD_CC) return ccTags;
          return bccTags;
        };

        const currentTags = getTags();
        const allTags = [...currentTags, ...newEmails];
        const newValue = allTags.join(', ');

        if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
        else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
        else onBccChange(newValue);

        setInputValues(prev => ({ ...prev, [field]: remaining.trim() }));
      }
    }

    const searchQuery = value.split(',').pop()?.trim() || value.trim();
    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(searchQuery);
    }, DEBOUNCE_DELAY_200_MS);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange, searchContacts]);

  const handleSelectContact = useCallback((contact: Contact, field: FieldType) => {
    const getTags = () => {
      if (field === EMAIL_FIELD_TO) return toTags;
      if (field === EMAIL_FIELD_CC) return ccTags;
      return bccTags;
    };

    const currentTags = getTags();
    const contactDisplay = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
    const newTags = [...currentTags, contactDisplay];
    const newValue = newTags.join(', ');

    if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
    else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
    else onBccChange(newValue);

    setInputValues(prev => ({ ...prev, [field]: '' }));
    setSearchResults([]);
    setActiveField(null);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, field: FieldType) => {
    const inputValue = inputValues[field];

    if (e.key === KEY_BACKSPACE && inputValue === '') {
      const getTags = () => {
        if (field === EMAIL_FIELD_TO) return toTags;
        if (field === EMAIL_FIELD_CC) return ccTags;
        return bccTags;
      };
      const tags = getTags();
      if (tags.length > 0) {
        handleRemoveTag(tags.length - 1, field);
      }
      return;
    }

    if (e.key === KEY_ENTER && inputValue.trim() && !/[\r\n]/.test(inputValue.trim()) && isValidEmail(inputValue.trim())) {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && searchResults.length > 0) {
        handleSelectContact(searchResults[selectedSuggestionIndex], field);
      } else {
        const getTags = () => {
          if (field === EMAIL_FIELD_TO) return toTags;
          if (field === EMAIL_FIELD_CC) return ccTags;
          return bccTags;
        };
        const currentTags = getTags();
        const newTags = [...currentTags, inputValue.trim()];
        const newValue = newTags.join(', ');

        if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
        else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
        else onBccChange(newValue);

        setInputValues(prev => ({ ...prev, [field]: '' }));
        setSearchResults([]);
      }
      return;
    }

    if (searchResults.length === 0) return;

    if (e.key === KEY_ARROW_DOWN) {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === KEY_ARROW_UP) {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === KEY_ENTER && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      handleSelectContact(searchResults[selectedSuggestionIndex], field);
    } else if (e.key === KEY_ESCAPE) {
      setSearchResults([]);
      setActiveField(null);
    }
  }, [searchResults, selectedSuggestionIndex, handleSelectContact, inputValues, toTags, ccTags, bccTags, handleRemoveTag, onRecipientsChange, onCcChange, onBccChange]);

  const handleBlur = useCallback((field: FieldType) => {
    const inputValue = inputValues[field]?.trim();
    if (inputValue && !/[\r\n]/.test(inputValue) && isValidEmail(inputValue)) {
      const currentTags = (() => {
        if (field === EMAIL_FIELD_TO) return toTags;
        if (field === EMAIL_FIELD_CC) return ccTags;
        return bccTags;
      })();
      const newTags = [...currentTags, inputValue];
      const newValue = newTags.join(', ');

      if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
      else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
      else onBccChange(newValue);

      setInputValues(prev => ({ ...prev, [field]: '' }));
    }
    setTimeout(() => {
      setSearchResults([]);
      setActiveField(null);
    }, DEBOUNCE_DELAY_200_MS);
  }, [inputValues, toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSearchResults([]);
        setActiveField(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderField = (
    label: string,
    tags: string[],
    field: FieldType,
  ) => (
    <div style={{ marginBottom: theme.spacing.sm, position: 'relative' }}>
      <label style={{ 
        display: 'block', 
        fontSize: theme.typography.fontSize.sm, 
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.xs,
      }}>
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
        onClick={(e) => {
          const input = e.currentTarget.querySelector('input');
          if (input) input.focus();
        }}
      >
        {tags.map((tag, index) => (
          <span
            key={tag}
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
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tag}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveTag(index, field);
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
        ))}
        <input
          type="text"
          value={inputValues[field]}
          onChange={(e) => handleInputChange(e.target.value, field)}
          onFocus={() => setActiveField(field)}
          onBlur={() => handleBlur(field)}
          onKeyDown={(e) => handleKeyDown(e, field)}
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
        <div
          ref={dropdownRef}
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
          {searchResults.map((contact, index) => (
            <div
              key={contact.id || contact.email}
              onClick={() => handleSelectContact(contact, field)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: index === selectedSuggestionIndex 
                  ? theme.colors.background.subtle 
                  : 'transparent',
                borderBottom: index < searchResults.length - 1 
                  ? `1px solid ${theme.colors.border.light}` 
                  : 'none',
              }}
              onMouseEnter={(e) => {
                setSelectedSuggestionIndex(index);
                e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
              }}
              onMouseLeave={(e) => {
                if (index !== selectedSuggestionIndex) {
                  e.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
                }
              }}
            >
              {contact.photoUrl ? (
                <img
                  src={contact.photoUrl}
                  alt=""
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: theme.colors.primary.subtle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.colors.primary.main,
                    fontSize: '11px',
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
  );

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      {renderField(t('compose.to'), toTags, EMAIL_FIELD_TO)}
      
      {showCc && renderField(t('compose.cc'), ccTags, EMAIL_FIELD_CC)}
      {showBcc && renderField(t('compose.bcc'), bccTags, EMAIL_FIELD_BCC)}
      
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



