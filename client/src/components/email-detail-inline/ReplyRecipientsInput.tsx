import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';

import { API_URL } from 'config/api';

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

type FieldType = 'to' | 'cc' | 'bcc';

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
  const [inputValues, setInputValues] = useState<Record<FieldType, string>>({ to: '', cc: '', bcc: '' });
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
      if (field === 'to') return toTags;
      if (field === 'cc') return ccTags;
      return bccTags;
    };

    const tags = getTags();
    const newTags = tags.filter((_, i) => i !== index);
    const newValue = newTags.join(', ');

    if (field === 'to') onRecipientsChange(newValue);
    else if (field === 'cc') onCcChange(newValue);
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
      const newEmails = parts.slice(0, -1).map(e => e.trim()).filter(e => e.length > 0 && isValidEmail(e));
      const remaining = parts[parts.length - 1];

      if (newEmails.length > 0) {
        const getTags = () => {
          if (field === 'to') return toTags;
          if (field === 'cc') return ccTags;
          return bccTags;
        };

        const currentTags = getTags();
        const allTags = [...currentTags, ...newEmails];
        const newValue = allTags.join(', ');

        if (field === 'to') onRecipientsChange(newValue);
        else if (field === 'cc') onCcChange(newValue);
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
      if (field === 'to') return toTags;
      if (field === 'cc') return ccTags;
      return bccTags;
    };

    const currentTags = getTags();
    const contactDisplay = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
    const newTags = [...currentTags, contactDisplay];
    const newValue = newTags.join(', ');

    if (field === 'to') onRecipientsChange(newValue);
    else if (field === 'cc') onCcChange(newValue);
    else onBccChange(newValue);

    setInputValues(prev => ({ ...prev, [field]: '' }));
    setSearchResults([]);
    setActiveField(null);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, field: FieldType) => {
    const inputValue = inputValues[field];

    if (e.key === 'Backspace' && inputValue === '') {
      const getTags = () => {
        if (field === 'to') return toTags;
        if (field === 'cc') return ccTags;
        return bccTags;
      };
      const tags = getTags();
      if (tags.length > 0) {
        handleRemoveTag(tags.length - 1, field);
      }
      return;
    }

    if (e.key === 'Enter' && inputValue.trim() && isValidEmail(inputValue.trim())) {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && searchResults.length > 0) {
        handleSelectContact(searchResults[selectedSuggestionIndex], field);
      } else {
        const getTags = () => {
          if (field === 'to') return toTags;
          if (field === 'cc') return ccTags;
          return bccTags;
        };
        const currentTags = getTags();
        const newTags = [...currentTags, inputValue.trim()];
        const newValue = newTags.join(', ');

        if (field === 'to') onRecipientsChange(newValue);
        else if (field === 'cc') onCcChange(newValue);
        else onBccChange(newValue);

        setInputValues(prev => ({ ...prev, [field]: '' }));
        setSearchResults([]);
      }
      return;
    }

    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      handleSelectContact(searchResults[selectedSuggestionIndex], field);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setActiveField(null);
    }
  }, [searchResults, selectedSuggestionIndex, handleSelectContact, inputValues, toTags, ccTags, bccTags, handleRemoveTag, onRecipientsChange, onCcChange, onBccChange]);

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
            key={`${tag}-${index}`}
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
                background: 'none',
                border: 'none',
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
          onKeyDown={(e) => handleKeyDown(e, field)}
          style={{
            flex: 1,
            minWidth: '120px',
            border: 'none',
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
                  e.currentTarget.style.backgroundColor = 'transparent';
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
      {renderField(t('compose.to'), toTags, 'to')}
      
      {showCc && renderField(t('compose.cc'), ccTags, 'cc')}
      {showBcc && renderField(t('compose.bcc'), bccTags, 'bcc')}
      
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {!showCc && (
          <button
            onClick={onShowCc}
            type="button"
            style={{
              background: 'none',
              border: 'none',
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
              background: 'none',
              border: 'none',
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



