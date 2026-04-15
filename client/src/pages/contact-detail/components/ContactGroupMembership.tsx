import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useContactGroupsQuery,
  useCreateContactGroupMutation,
  useUpdateContactGroupMutation,
} from 'queries/contactGroups';
import { theme } from 'theme/theme';
import { ContactGroup } from 'types/contactGroup';

import { COLOR_WHITE } from 'constants/colors';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

/** Opacity for primary controls that are temporarily disabled (matches common UI convention). */
const DISABLED_PRIMARY_OPACITY = 0.6;

interface ContactGroupMembershipProps {
  contactId: string;
  contactEmail: string;
  contactName?: string;
  sectionStyle: React.CSSProperties;
}

export const ContactGroupMembership: React.FC<ContactGroupMembershipProps> = ({
  contactId,
  contactEmail,
  contactName,
  sectionStyle,
}) => {
  const { t } = useTranslation();
  const { data: groups = [], isLoading } = useContactGroupsQuery();
  const updateMutation = useUpdateContactGroupMutation();
  const createMutation = useCreateContactGroupMutation();

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  const memberGroups = groups.filter(group =>
    group.members.some(member => member.contactId === contactId)
  );
  const availableGroups = groups.filter(
    group => !group.members.some(member => member.contactId === contactId)
  );

  const handleAddToGroup = async (group: ContactGroup) => {
    const updatedIds = [...group.members.map(member => member.contactId), contactId];
    await updateMutation.mutateAsync({ id: group.id, payload: { memberContactIds: updatedIds } });
    setShowAddPanel(false);
  };

  const handleRemoveFromGroup = async (group: ContactGroup) => {
    const updatedIds = group.members.map(member => member.contactId).filter(id => id !== contactId);
    await updateMutation.mutateAsync({ id: group.id, payload: { memberContactIds: updatedIds } });
  };

  const handleCreateAndAdd = async () => {
    if (!newGroupName.trim()) {
      return;
    }
    await createMutation.mutateAsync({ name: newGroupName.trim(), memberContactIds: [contactId] });
    setNewGroupName('');
    setCreatingNew(false);
    setShowAddPanel(false);
  };

  const buttonSecondary: React.CSSProperties = {
    padding: '4px 10px',
    background: STRING_NONE,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  };

  const buttonPrimary: React.CSSProperties = {
    padding: '6px 14px',
    backgroundColor: theme.colors.primary.main,
    color: COLOR_WHITE,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  };

  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}
      >
        <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
          {t('settings.contactGroups.contactMemberships')}
        </h2>
        <button onClick={() => setShowAddPanel(prev => !prev)} style={buttonPrimary}>
          {t('settings.contactGroups.addToGroup')}
        </button>
      </div>

      {isLoading ? ( // eslint-disable-line no-nested-ternary
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('common.loading')}
        </p>
      ) : memberGroups.length === 0 ? (
        <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.contactGroups.notInAnyGroup')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
          {memberGroups.map(group => (
            <span
              key={group.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                backgroundColor: theme.colors.primary.subtle,
                borderRadius: theme.borderRadius.full,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
              }}
            >
              {group.name}
              <button
                onClick={() => handleRemoveFromGroup(group)}
                disabled={updateMutation.isPending}
                style={{
                  background: STRING_NONE,
                  border: STRING_NONE,
                  cursor: 'pointer',
                  padding: 0,
                  color: theme.colors.text.secondary,
                  lineHeight: 1,
                }}
                aria-label={`Remove from ${group.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {showAddPanel && (
        <div
          style={{
            marginTop: theme.spacing.md,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.subtle,
          }}
        >
          {availableGroups.length > 0 && (
            <div style={{ marginBottom: theme.spacing.md }}>
              <p
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.sm,
                }}
              >
                {t('settings.contactGroups.addToExistingGroup')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {availableGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => handleAddToGroup(group)}
                    disabled={updateMutation.isPending}
                    style={{
                      ...buttonSecondary,
                      padding: '4px 12px',
                    }}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!creatingNew ? (
            <button
              onClick={() => setCreatingNew(true)}
              style={{ ...buttonSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              + {t('settings.contactGroups.createNewGroup')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
              <input
                autoFocus
                value={newGroupName}
                onChange={event => setNewGroupName(event.target.value)}
                placeholder={t('settings.contactGroups.newGroupName')}
                onKeyDown={event => {
                  if (event.key === KEY_ENTER) {
                    handleCreateAndAdd();
                  } else if (event.key === KEY_ESCAPE) {
                    setCreatingNew(false);
                    setNewGroupName('');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.sm,
                  fontSize: theme.typography.fontSize.sm,
                }}
              />
              <button
                onClick={handleCreateAndAdd}
                disabled={createMutation.isPending || !newGroupName.trim()}
                style={{
                  ...buttonPrimary,
                  opacity: createMutation.isPending || !newGroupName.trim() ? DISABLED_PRIMARY_OPACITY : 1,
                  cursor: createMutation.isPending || !newGroupName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {createMutation.isPending ? t('settings.contactGroups.creating') : t('common.save')}
              </button>
              <button
                onClick={() => {
                  setCreatingNew(false);
                  setNewGroupName('');
                }}
                style={buttonSecondary}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
