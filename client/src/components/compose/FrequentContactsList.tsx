import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';

interface FrequentContactsListProps {
  frequentContacts: Contact[];
  to: Contact[];
  activeField: 'to' | 'cc' | 'bcc' | null;
  onAddRecipient: (contact: Contact, field: 'to' | 'cc' | 'bcc') => void;
}

export const FrequentContactsList: React.FC<FrequentContactsListProps> = ({
  frequentContacts,
  to,
  activeField,
  onAddRecipient,
}) => {
  const { t } = useTranslation();

  if (frequentContacts.length === 0 || to.length > 0 || activeField !== null) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <p
        style={{
          margin: `0 0 ${theme.spacing.sm} 0`,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
        }}
      >
        {t('compose.frequentContacts')}:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {frequentContacts.map(contact => (
          <button
            key={contact.id || contact.email}
            onClick={() => onAddRecipient(contact, 'to')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.full,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
              transition: theme.transitions.default,
            }}
          >
            {contact.photoUrl ? (
              <img
                src={contact.photoUrl}
                alt=""
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                }}
              />
            ) : (
              <div
                style={{
                  width: '20px',
                  height: '20px',
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
            {contact.name || contact.email}
          </button>
        ))}
      </div>
    </div>
  );
};
