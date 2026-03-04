import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { FONT_SIZE_XS_PX, FONT_SIZE_MD_PX, DEFAULT_AVATAR_SIZE_PX, AVATAR_SIZE_SMALL_PX } from 'constants/numbers';
import { EMAIL_FIELD_BCC, EMAIL_FIELD_CC, EMAIL_FIELD_TO, KEY_COMMA, KEY_ENTER, STRING_NONE } from 'constants/strings';
import { Contact } from 'types/contact';
import { COLOR_TRANSPARENT } from 'constants/colors';


const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const extractedEmail = email.match(/<([^>]+)>/)?.[1] || email;
  return emailRegex.test(extractedEmail.trim());
};

interface Recipient {
  email: string;
  name?: string;
}

interface RecipientFieldsProps {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  showCc: boolean;
  showBcc: boolean;
  activeField: 'to' | 'cc' | 'bcc' | null;
  searchQuery: string;
  searchResults: Contact[];
  onAddRecipient: (contact: Contact | { email: string; name?: string }, field: 'to' | 'cc' | 'bcc') => void;
  onRemoveRecipient: (email: string, field: 'to' | 'cc' | 'bcc') => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onSetActiveField: (field: 'to' | 'cc' | 'bcc' | null) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSearchResult: (contact: Contact) => void;
}

// eslint-disable-next-line max-lines-per-function -- Recipient field management requires extensive form handling logic
export const RecipientFields: React.FC<RecipientFieldsProps> = ({
  to,
  cc,
  bcc,
  showCc,
  showBcc,
  activeField,
  searchQuery,
  searchResults,
  onAddRecipient,
  onRemoveRecipient,
  onShowCc,
  onShowBcc,
  onSetActiveField,
  onSearchQueryChange,
  onSelectSearchResult,
}) => {
  const { t } = useTranslation();

  // eslint-disable-next-line max-lines-per-function -- Recipient field rendering requires extensive form handling logic
  const renderRecipientField = (
    label: string,
    recipients: Recipient[],
    field: 'to' | 'cc' | 'bcc',
    isActive: boolean
  ) => (
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
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', position: 'relative' }}>
        {recipients.map((recipient) => (
          <div
            key={recipient.email}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              backgroundColor: theme.colors.primary.subtle,
              borderRadius: theme.borderRadius.full,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            <span style={{ color: theme.colors.text.primary }}>
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
          type="text"
          value={isActive ? searchQuery : ''}
          onChange={(e) => {
            onSetActiveField(field);
            onSearchQueryChange(e.target.value);
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
          onKeyDown={(e) => {
            if ((e.key === KEY_ENTER || e.key === KEY_COMMA) && searchQuery.trim()) {
              e.preventDefault();
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
        {isActive && searchResults.length > 0 && (
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
            {searchResults.map((contact) => (
              <div
                key={contact.id || contact.email}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => onSelectSearchResult(contact)}
                style={{
                  padding: `8px ${FONT_SIZE_XS_PX}px`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: `1px solid ${theme.colors.border.light}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
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

