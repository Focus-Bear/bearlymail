import React, { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const SAVING_OPACITY = 0.7;

interface ProfileSettingsSectionProps {
  displayName?: string;
  jobTitle?: string;
  onUpdate: (updates: { displayName?: string; jobTitle?: string }) => Promise<void>;
}

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  displayName: initialDisplayName,
  jobTitle: initialJobTitle,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(initialDisplayName || '');
  const [jobTitle, setJobTitle] = useState(initialJobTitle || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayName(initialDisplayName || '');
    setJobTitle(initialJobTitle || '');
  }, [initialDisplayName, initialJobTitle]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({ displayName, jobTitle });
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
    setIsEditing(false);
  };

  return (
    <div style={{
      marginBottom: theme.spacing.lg,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
      }}>
        <h4 style={{
          ...theme.typography.heading.h6,
          color: theme.colors.text.primary,
          margin: 0,
        }}>
          {t('settings.profile.title')}
        </h4>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
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

      <p style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.tertiary,
        marginTop: 0,
        marginBottom: theme.spacing.md,
      }}>
        {t('settings.profile.description')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div>
          <label style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
          }}>
            {t('settings.profile.displayNameLabel')}
          </label>
          {isEditing ? (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('settings.profile.displayNamePlaceholder')}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                ...theme.typography.body.large,
              }}
            />
          ) : (
            <div style={{
              ...theme.typography.body.large,
              color: displayName ? theme.colors.text.primary : theme.colors.text.tertiary,
              fontStyle: displayName ? 'normal' : 'italic',
            }}>
              {displayName || t('settings.profile.notSet')}
            </div>
          )}
        </div>

        <div>
          <label style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.secondary,
            display: 'block',
            marginBottom: theme.spacing.xs,
          }}>
            {t('settings.profile.jobTitleLabel')}
          </label>
          {isEditing ? (
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t('settings.profile.jobTitlePlaceholder')}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                ...theme.typography.body.large,
              }}
            />
          ) : (
            <div style={{
              ...theme.typography.body.large,
              color: jobTitle ? theme.colors.text.primary : theme.colors.text.tertiary,
              fontStyle: jobTitle ? 'normal' : 'italic',
            }}>
              {jobTitle || t('settings.profile.notSet')}
            </div>
          )}
        </div>

        {isEditing && (
          <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <button
              onClick={handleSave}
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
              onClick={handleCancel}
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
        )}
      </div>
    </div>
  );
};
