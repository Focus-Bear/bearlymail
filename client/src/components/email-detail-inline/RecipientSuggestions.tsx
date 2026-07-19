import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { ContactGroup, RecipientSuggestion } from 'types/contactGroup';

import { SUGGESTION_KIND_GROUP } from 'constants/strings';

interface RecipientSuggestionsProps {
  contacts?: Contact[];
  suggestions?: RecipientSuggestion[];
  selectedIndex: number;
  onSelect: (contact: Contact) => void;
  onSelectGroup?: (group: ContactGroup) => void;
  onHover: (index: number) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  field: string; // unused here but kept for parity
}

export const RecipientSuggestions: React.FC<RecipientSuggestionsProps> = ({
  contacts,
  suggestions,
  selectedIndex,
  onSelect,
  onSelectGroup,
  onHover,
  dropdownRef,
}) => {
  const { t } = useTranslation();
  // Use suggestions (groups + contacts) if provided, otherwise fall back to plain contacts list
  const items: RecipientSuggestion[] = suggestions
    ? suggestions
    : (contacts ?? []).map((contact): RecipientSuggestion => ({ kind: 'contact', contact }));

  if (items.length === 0) {
    return null;
  }

  return (
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
      {items.map((item, index) => {
        if (item.kind === SUGGESTION_KIND_GROUP) {
          const { group } = item;
          return (
            <div
              key={`group-${group.id}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelectGroup?.(group)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor:
                  index === selectedIndex ? theme.colors.background.subtle : 'transparent',
                borderBottom: index < items.length - 1 ? `1px solid ${theme.colors.border.light}` : 'none',
              }}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={() => onHover(-1)}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: theme.colors.primary.main,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.colors.common.white,
                  fontSize: '11px',
                  fontWeight: theme.typography.fontWeight.semibold,
                  flexShrink: 0,
                }}
              >
                👥
              </div>
              <div>
                <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                  {group.name}
                </div>
                <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                  {t('settings.contactGroups.memberCount', { count: group.memberCount })}
                </div>
              </div>
            </div>
          );
        }

        // Contact suggestion
        const { contact } = item;
        return (
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
              borderBottom: index < items.length - 1 ? `1px solid ${theme.colors.border.light}` : 'none',
            }}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(-1)}
          >
            {contact.photoUrl ? (
              <img src={contact.photoUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
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
        );
      })}
    </div>
  );
};

export default RecipientSuggestions;
