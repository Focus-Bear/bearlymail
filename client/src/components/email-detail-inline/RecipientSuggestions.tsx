import React from 'react';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';


interface RecipientSuggestionsProps {
  contacts: Contact[];
  selectedIndex: number;
  onSelect: (contact: Contact) => void;
  onHover: (index: number) => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
  field: string; // unused here but kept for parity
}

export const RecipientSuggestions: React.FC<RecipientSuggestionsProps> = ({ contacts, selectedIndex, onSelect, onHover, dropdownRef }) => (
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
    {contacts.map((contact, index) => (
      <div
        key={contact.id || contact.email}
        onClick={() => onSelect(contact)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: index === selectedIndex ? theme.colors.background.subtle : 'transparent',
          borderBottom: index < contacts.length - 1 ? `1px solid ${theme.colors.border.light}` : 'none',
        }}
        onMouseEnter={() => onHover(index)}
        onMouseLeave={() => onHover(-1)}
      >
        {contact.photoUrl ? (
          <img src={contact.photoUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
        ) : (
          <div style={{
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
          }}>{(contact.name || contact.email)[0].toUpperCase()}</div>
        )}
        <div>
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>{contact.name || contact.email}</div>
          {contact.name && <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{contact.email}</div>}
        </div>
      </div>
    ))}
  </div>
);

export default RecipientSuggestions;
