/**
 * AttendeePicker stories — the checklist shown when creating a calendar invite
 * from an email. Pre-selected with everyone on the thread (sender + To + CC) so
 * the common case ("invite everyone") is one click; the user can uncheck anyone
 * or add a free-text email.
 */
import React, { useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { theme } from 'theme/theme';

import { AttendeePicker } from 'components/quick-actions/AttendeePicker';
import { Attendee } from 'utils/attendeeUtils';

const pickerI18n = i18n.createInstance();
pickerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        attendeePicker: {
          label: 'Who to invite',
          empty: 'No recipients found on this email',
          addPlaceholder: 'Add another email',
          add: 'Add',
          invalidEmail: 'Enter a valid email address',
        },
      },
    },
  },
  interpolation: { escapeValue: false },
});

const CANDIDATES: Attendee[] = [
  { name: 'Priya Sharma', email: 'priya@acme.com' },
  { name: 'Tom Becker', email: 'tom@acme.com' },
  { name: 'Dana Lee', email: 'dana@partner.io' },
  { name: 'accounts@partner.io', email: 'accounts@partner.io' },
];

const AttendeePickerDemo: React.FC = () => {
  const [selected, setSelected] = useState<string[]>(CANDIDATES.map((attendee) => attendee.email));
  return (
    <I18nextProvider i18n={pickerI18n}>
      <div
        style={{
          maxWidth: 420,
          margin: '24px auto',
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.primary.main}`,
          borderRadius: theme.borderRadius.md,
          fontFamily: theme.typography.fontFamily,
        }}
      >
        <div
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.sm,
          }}
        >
          📅 Create calendar invite
        </div>
        <AttendeePicker candidates={CANDIDATES} selectedEmails={selected} onChange={setSelected} />
      </div>
    </I18nextProvider>
  );
};

const meta: Meta<typeof AttendeePickerDemo> = {
  title: 'QuickActions/AttendeePicker',
  component: AttendeePickerDemo,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AttendeePickerDemo>;

export const AllThreadRecipientsPreSelected: Story = {
  name: 'All thread recipients pre-selected',
};
