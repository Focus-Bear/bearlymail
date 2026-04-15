import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useContactGroupsQuery, useCreateContactGroupMutation } from 'queries/contactGroups';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';

import { API_URL } from 'config/api';
import { COLOR_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { ContactGroupItem } from './ContactGroupItem';

export const ContactGroupsSection: React.FC = () => {
  const { t } = useTranslation();
  const { data: groups = [], isLoading } = useContactGroupsQuery();
  const createMutation = useCreateContactGroupMutation();

  const [newName, setNewName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [newMemberDetails, setNewMemberDetails] = useState<{ contactId: string; email: string; name?: string }[]>([]);

  const searchContacts = async (query: string) => {
    setContactSearch(query);
    if (!query || query.length < 2) {
      setContactResults([]);
      return;
    }
    try {
      const res = await axios.get<Contact[]>(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      // Exclude non-local (Gmail-only) contacts — they have no UUID in the local DB
      // and cannot be stored as group members.
      setContactResults(
        res.data.filter(contact => contact.id && contact.isLocal !== false && !newMemberIds.includes(contact.id))
      );
    } catch {
      setContactResults([]);
    }
  };

  const addMember = (contact: Contact) => {
    if (!contact.id || newMemberIds.includes(contact.id)) {
      return;
    }
    setNewMemberIds(prev => [...prev, contact.id!]);
    setNewMemberDetails(prev => [...prev, { contactId: contact.id!, email: contact.email, name: contact.name }]);
    setContactSearch('');
    setContactResults([]);
  };

  const removeMember = (contactId: string) => {
    setNewMemberIds(prev => prev.filter(id => id !== contactId));
    setNewMemberDetails(prev => prev.filter(member => member.contactId !== contactId));
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      return;
    }
    await createMutation.mutateAsync({
      name: newName.trim(),
      memberContactIds: newMemberIds,
    });
    setNewName('');
    setNewMemberIds([]);
    setNewMemberDetails([]);
    setContactSearch('');
    setContactResults([]);
  };

  return (
    <div id="contact-groups" style={{ marginBottom: theme.spacing.xl }}>
      <h2
        style={{
          fontSize: theme.typography.fontSize.xl,
          fontWeight: '600',
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.primary,
        }}
      >
        {t('settings.contactGroups.title')}
      </h2>

      <p
        style={{
          marginBottom: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {t('settings.contactGroups.description')}
      </p>

      {/* Existing groups */}
      {isLoading && (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('common.loading')}
        </p>
      )}
      {!isLoading && groups.length === 0 && (
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('settings.contactGroups.noGroups')}
        </p>
      )}
      {!isLoading && groups.length > 0 && (
        <div style={{ marginBottom: theme.spacing.md }}>
          {groups.map(group => (
            <ContactGroupItem key={group.id} group={group} />
          ))}
        </div>
      )}

      {/* Create new group */}
      <div
        style={{
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.subtle,
        }}
      >
        <h3
          style={{
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.sm,
            color: theme.colors.text.primary,
          }}
        >
          {t('settings.contactGroups.createGroup')}
        </h3>

        <input
          value={newName}
          onChange={event => setNewName(event.target.value)}
          placeholder={t('settings.contactGroups.newGroupPlaceholder')}
          style={{
            width: '100%',
            padding: '8px',
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.base,
            marginBottom: theme.spacing.sm,
            boxSizing: 'border-box',
          }}
        />

        {/* Member chips */}
        {newMemberDetails.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: theme.spacing.sm }}>
            {newMemberDetails.map(member => (
              <span
                key={member.contactId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: theme.colors.primary.subtle,
                  borderRadius: theme.borderRadius.full,
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {member.name || member.email}
                <button
                  onClick={() => removeMember(member.contactId)}
                  style={{
                    background: STRING_NONE,
                    border: STRING_NONE,
                    cursor: 'pointer',
                    padding: 0,
                    color: theme.colors.text.secondary,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Contact search */}
        <div style={{ position: 'relative', marginBottom: theme.spacing.sm }}>
          <input
            value={contactSearch}
            onChange={event => searchContacts(event.target.value)}
            placeholder={t('settings.contactGroups.searchContacts')}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.sm,
              boxSizing: 'border-box',
            }}
          />
          {contactResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: theme.colors.background.paper,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.lg,
                zIndex: 100,
                maxHeight: '160px',
                overflowY: 'auto',
              }}
            >
              {contactResults.map(contact => (
                <div
                  key={contact.id || contact.email}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => addMember(contact)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  {contact.name || contact.email}
                  {contact.name && (
                    <span style={{ color: theme.colors.text.secondary, marginLeft: '6px' }}>{contact.email}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={createMutation.isPending || !newName.trim()}
          style={{
            padding: '8px 20px',
            backgroundColor:
              createMutation.isPending || !newName.trim() ? theme.colors.greyscale[400] : theme.colors.primary.main,
            color: COLOR_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: createMutation.isPending || !newName.trim() ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {createMutation.isPending ? t('settings.contactGroups.creating') : t('settings.contactGroups.createGroup')}
        </button>
      </div>
    </div>
  );
};
