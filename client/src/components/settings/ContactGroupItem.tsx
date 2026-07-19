import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useDeleteContactGroupMutation, useUpdateContactGroupMutation } from 'queries/contactGroups';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { ContactGroup } from 'types/contactGroup';

import { API_URL } from 'config/api';
import { COLOR_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ContactGroupItemProps {
  group: ContactGroup;
}

export const ContactGroupItem: React.FC<ContactGroupItemProps> = ({ group }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [editMemberIds, setEditMemberIds] = useState<string[]>(group.members.map(member => member.contactId));
  const [editMemberDetails, setEditMemberDetails] = useState<{ contactId: string; email: string; name?: string }[]>(
    group.members
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useUpdateContactGroupMutation();
  const deleteMutation = useDeleteContactGroupMutation();

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
        res.data.filter(contact => contact.id && contact.isLocal !== false && !editMemberIds.includes(contact.id))
      );
    } catch {
      setContactResults([]);
    }
  };

  const addMember = (contact: Contact) => {
    if (!contact.id || editMemberIds.includes(contact.id)) {
      return;
    }
    setEditMemberIds(prev => [...prev, contact.id!]);
    setEditMemberDetails(prev => [...prev, { contactId: contact.id!, email: contact.email, name: contact.name }]);
    setContactSearch('');
    setContactResults([]);
  };

  const removeMember = (contactId: string) => {
    setEditMemberIds(prev => prev.filter(id => id !== contactId));
    setEditMemberDetails(prev => prev.filter(member => member.contactId !== contactId));
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: group.id,
      payload: { name: editName, memberContactIds: editMemberIds },
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(group.id);
  };

  if (editing) {
    return (
      <div
        style={{
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}
      >
        <input
          value={editName}
          onChange={event => setEditName(event.target.value)}
          placeholder={t('settings.contactGroups.namePlaceholder')}
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

        <div style={{ marginBottom: theme.spacing.sm }}>
          <strong style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('settings.contactGroups.members')} ({editMemberIds.length})
          </strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {editMemberDetails.map(member => (
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
        </div>

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

        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !editName.trim()}
            style={{
              padding: '6px 16px',
              backgroundColor: theme.colors.primary.main,
              color: COLOR_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              padding: '6px 16px',
              background: STRING_NONE,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.sm,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div>
        <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
          {group.name}
        </span>
        <span
          style={{
            marginLeft: '8px',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          ({group.memberCount} {t('settings.contactGroups.membersCount')})
        </span>
      </div>

      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
        <button
          onClick={() => {
            setEditing(true);
            setEditName(group.name);
            setEditMemberIds(group.members.map(member => member.contactId));
            setEditMemberDetails(group.members);
          }}
          style={{
            background: STRING_NONE,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('common.edit')}
        </button>

        {confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              style={{
                background: STRING_NONE,
                border: `1px solid ${theme.colors.error.main}`,
                borderRadius: theme.borderRadius.sm,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.error.main,
              }}
            >
              {t('common.confirmDelete')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                background: STRING_NONE,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              background: STRING_NONE,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}
          >
            {t('common.delete')}
          </button>
        )}
      </div>
    </div>
  );
};
