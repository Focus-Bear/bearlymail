import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Attendee, isValidEmail, parseAddress } from 'utils/attendeeUtils';

import { KEY_ENTER } from 'constants/strings';

interface AttendeePickerProps {
  /** Candidate attendees derived from the thread (sender + To + CC). */
  candidates: Attendee[];
  /** Currently selected attendee emails (controlled). */
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
}

/**
 * Checklist of candidate attendees for a calendar invite, pre-selected from the
 * thread's recipients so the common case (invite everyone) is one click. The user
 * can uncheck anyone or add a free-text email address.
 */
export const AttendeePicker: React.FC<AttendeePickerProps> = ({ candidates, selectedEmails, onChange }) => {
  const { t } = useTranslation();
  // Free-text additions that are not part of the thread's candidates. Kept as rows
  // (even once unchecked) so the user can re-select without retyping.
  const [extras, setExtras] = useState<Attendee[]>([]);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');

  const rows = useMemo(() => {
    const byEmail = new Map<string, Attendee>();
    for (const attendee of [...candidates, ...extras]) {
      if (!byEmail.has(attendee.email)) {
        byEmail.set(attendee.email, attendee);
      }
    }
    return Array.from(byEmail.values());
  }, [candidates, extras]);

  const selectedSet = useMemo(() => new Set(selectedEmails), [selectedEmails]);

  const toggle = (email: string): void => {
    if (selectedSet.has(email)) {
      onChange(selectedEmails.filter((selected) => selected !== email));
    } else {
      onChange([...selectedEmails, email]);
    }
  };

  const handleAdd = (): void => {
    const parsed = parseAddress(input);
    if (!parsed || !isValidEmail(parsed.email)) {
      setInputError(t('attendeePicker.invalidEmail'));
      return;
    }
    if (!rows.some((row) => row.email === parsed.email)) {
      setExtras((prev) => [...prev, parsed]);
    }
    if (!selectedSet.has(parsed.email)) {
      onChange([...selectedEmails, parsed.email]);
    }
    setInput('');
    setInputError('');
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      handleAdd();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <span
        style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
        }}
      >
        {t('attendeePicker.label')}
      </span>

      {rows.length === 0 && (
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
          {t('attendeePicker.empty')}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {rows.map((attendee) => {
          const checked = selectedSet.has(attendee.email);
          const showName = attendee.name && attendee.name.toLowerCase() !== attendee.email;
          return (
            <label
              key={attendee.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(attendee.email)}
                aria-label={attendee.email}
              />
              <span>
                {showName ? (
                  <>
                    <span style={{ color: theme.colors.text.primary }}>{attendee.name}</span>{' '}
                    <span style={{ color: theme.colors.text.tertiary }}>&lt;{attendee.email}&gt;</span>
                  </>
                ) : (
                  <span style={{ color: theme.colors.text.primary }}>{attendee.email}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'flex-start' }}>
        <input
          type="email"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (inputError) {
              setInputError('');
            }
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={t('attendeePicker.addPlaceholder')}
          aria-label={t('attendeePicker.addPlaceholder')}
          style={{
            flex: 1,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.background.paper,
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.background.default,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
          }}
        >
          {t('attendeePicker.add')}
        </button>
      </div>
      {inputError && (
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>{inputError}</span>
      )}
    </div>
  );
};
