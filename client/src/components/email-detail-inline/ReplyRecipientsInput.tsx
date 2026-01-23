import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleInputChange = useCallback((value: string, field: FieldType) => {
    if (field === 'to') onRecipientsChange(value);
    else if (field === 'cc') onCcChange(value);
    else onBccChange(value);
    
    setActiveField(field);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const lastEmail = value.split(',').pop()?.trim() || '';
    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(lastEmail);
    }, DEBOUNCE_DELAY_200_MS);
  }, [onRecipientsChange, onCcChange, onBccChange, searchContacts]);

  const handleSelectContact = useCallback((contact: Contact, field: FieldType) => {
    const getValue = () => {
      if (field === 'to') return replyRecipients;
      if (field === 'cc') return replyCc;
      return replyBcc;
    };

    const currentValue = getValue();
    const emails = currentValue.split(',').map(e => e.trim()).filter(e => e);
    emails.pop();
    const contactDisplay = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
    emails.push(contactDisplay);
    const newValue = emails.join(', ') + ', ';

    if (field === 'to') onRecipientsChange(newValue);
    else if (field === 'cc') onCcChange(newValue);
    else onBccChange(newValue);

    setSearchResults([]);
    setActiveField(null);
  }, [replyRecipients, replyCc, replyBcc, onRecipientsChange, onCcChange, onBccChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, field: FieldType) => {
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
  }, [searchResults, selectedSuggestionIndex, handleSelectContact]);

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
    value: string,
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
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value, field)}
        onFocus={() => setActiveField(field)}
        onKeyDown={(e) => handleKeyDown(e, field)}
        style={{
          width: '100%',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          outline: 'none',
        }}
        placeholder={t('compose.recipientPlaceholder')}
      />
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
      {renderField(t('compose.to'), replyRecipients, 'to')}
      
      {showCc && renderField(t('compose.cc'), replyCc, 'cc')}
      {showBcc && renderField(t('compose.bcc'), replyBcc, 'bcc')}
      
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



