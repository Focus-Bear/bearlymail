import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const SAVING_OPACITY = 0.7;

interface ProfileSettingsSectionProps {
  displayName?: string;
  jobTitle?: string;
  calendarBookingUrl?: string;
  onUpdate: (updates: { displayName?: string; jobTitle?: string; calendarBookingUrl?: string }) => Promise<void>;
}

interface ProfileSectionHeaderProps {
  isEditing: boolean;
  onEditClick: () => void;
}

const ProfileSectionHeader: React.FC<ProfileSectionHeaderProps> = ({ isEditing, onEditClick }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
      }}
    >
      <h4 style={{ ...theme.typography.heading.h6, color: theme.colors.text.primary, margin: 0 }}>
        {t('settings.profile.title')}
      </h4>
      {!isEditing && (
        <button
          onClick={onEditClick}
          style={{
            background: STRING_NONE,
            border: STRING_NONE,
            color: theme.colors.primary.main,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.edit')}
        </button>
      )}
    </div>
  );
};

interface ProfileFormActionsProps {
  isSaving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const ProfileFormActions: React.FC<ProfileFormActionsProps> = ({ isSaving, onSave, onCancel }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? SAVING_OPACITY : 1,
          ...theme.typography.body.medium,
        }}
      >
        {isSaving ? t('common.saving') : t('common.save')}
      </button>
      <button
        onClick={onCancel}
        disabled={isSaving}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          ...theme.typography.body.medium,
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  displayName: initialDisplayName,
  jobTitle: initialJobTitle,
  calendarBookingUrl: initialCalendarBookingUrl,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(initialDisplayName || '');
  const [jobTitle, setJobTitle] = useState(initialJobTitle || '');
  const [calendarBookingUrl, setCalendarBookingUrl] = useState(initialCalendarBookingUrl || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayName(initialDisplayName || '');
    setJobTitle(initialJobTitle || '');
    setCalendarBookingUrl(initialCalendarBookingUrl || '');
  }, [initialDisplayName, initialJobTitle, initialCalendarBookingUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({ displayName, jobTitle, calendarBookingUrl });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(initialDisplayName || '');
    setJobTitle(initialJobTitle || '');
    setCalendarBookingUrl(initialCalendarBookingUrl || '');
    setIsEditing(false);
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <ProfileSectionHeader isEditing={isEditing} onEditClick={() => setIsEditing(true)} />

      <p
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.tertiary,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('settings.profile.description')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <ProfileField
          label={t('settings.profile.displayNameLabel')}
          value={displayName}
          isEditing={isEditing}
          placeholder={t('settings.profile.displayNamePlaceholder')}
          onChange={setDisplayName}
        />
        <ProfileField
          label={t('settings.profile.jobTitleLabel')}
          value={jobTitle}
          isEditing={isEditing}
          placeholder={t('settings.profile.jobTitlePlaceholder')}
          onChange={setJobTitle}
        />
        <ProfileField
          label={t('settings.profile.calendarBookingUrlLabel')}
          value={calendarBookingUrl}
          isEditing={isEditing}
          placeholder={t('settings.profile.calendarBookingUrlPlaceholder')}
          onChange={setCalendarBookingUrl}
        />

        {isEditing && <ProfileFormActions isSaving={isSaving} onSave={handleSave} onCancel={handleCancel} />}
      </div>
    </div>
  );
};

const ProfileField: React.FC<{
  label: string;
  value: string;
  isEditing: boolean;
  placeholder: string;
  onChange: (v: string) => void;
}> = ({ label, value, isEditing, placeholder, onChange }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.secondary,
          display: 'block',
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </label>
      {isEditing ? (
        <input
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            ...theme.typography.body.large,
          }}
        />
      ) : (
        <div
          style={{
            ...theme.typography.body.large,
            color: value ? theme.colors.text.primary : theme.colors.text.tertiary,
            fontStyle: value ? 'normal' : 'italic',
          }}
        >
          {value || t('settings.profile.notSet')}
        </div>
      )}
    </div>
  );
};
