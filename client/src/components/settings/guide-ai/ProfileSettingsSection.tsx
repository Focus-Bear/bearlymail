import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { SaveStatus } from 'components/settings/SaveStatus';
import { useAutosave } from 'hooks/useAutosave';

interface ProfileFields {
  displayName: string;
  jobTitle: string;
  calendarBookingUrl: string;
}

interface ProfileSettingsSectionProps {
  displayName?: string;
  jobTitle?: string;
  calendarBookingUrl?: string;
  onUpdate: (updates: Partial<ProfileFields>) => Promise<void>;
}

/**
 * Name, job title and booking link used in replies. The fields are always
 * editable and save themselves a moment after the user stops typing (#482).
 */
export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  displayName: savedDisplayName,
  jobTitle: savedJobTitle,
  calendarBookingUrl: savedCalendarBookingUrl,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const [fields, setFields] = useState<ProfileFields>({
    displayName: savedDisplayName || '',
    jobTitle: savedJobTitle || '',
    calendarBookingUrl: savedCalendarBookingUrl || '',
  });
  const hasEditedRef = useRef(false);
  const autosave = useAutosave<ProfileFields>(onUpdate);

  // Follow the loaded values until the user types: after that, each save
  // echoes back through these props and must not overwrite newer typing.
  useEffect(() => {
    if (!hasEditedRef.current) {
      setFields({
        displayName: savedDisplayName || '',
        jobTitle: savedJobTitle || '',
        calendarBookingUrl: savedCalendarBookingUrl || '',
      });
    }
  }, [savedDisplayName, savedJobTitle, savedCalendarBookingUrl]);

  const editField = (name: keyof ProfileFields, value: string) => {
    hasEditedRef.current = true;
    const next = { ...fields, [name]: value };
    setFields(next);
    autosave.saveSoon(next);
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
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
          marginBottom: theme.spacing.md,
        }}
      >
        <h4 style={{ ...theme.typography.heading.h6, color: theme.colors.text.primary, margin: 0 }}>
          {t('settings.profile.title')}
        </h4>
        <SaveStatus status={autosave.status} onRetry={autosave.retry} />
      </div>

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
          value={fields.displayName}
          placeholder={t('settings.profile.displayNamePlaceholder')}
          onChange={value => editField('displayName', value)}
        />
        <ProfileField
          label={t('settings.profile.jobTitleLabel')}
          value={fields.jobTitle}
          placeholder={t('settings.profile.jobTitlePlaceholder')}
          onChange={value => editField('jobTitle', value)}
        />
        <ProfileField
          label={t('settings.profile.calendarBookingUrlLabel')}
          value={fields.calendarBookingUrl}
          placeholder={t('settings.profile.calendarBookingUrlPlaceholder')}
          onChange={value => editField('calendarBookingUrl', value)}
        />
      </div>
    </div>
  );
};

const ProfileField: React.FC<{
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}> = ({ label, value, placeholder, onChange }) => {
  const inputId = useId();
  return (
    <div>
      <label
        htmlFor={inputId}
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.secondary,
          display: 'block',
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </label>
      <input
        id={inputId}
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
    </div>
  );
};
