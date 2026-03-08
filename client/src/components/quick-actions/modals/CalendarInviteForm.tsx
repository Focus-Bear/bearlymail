import React from 'react';

import { CalendarInviteFormFields } from 'components/quick-actions/modals/CalendarInviteFormFields';

interface CalendarInviteFormProps {
  guestEmail: string;
  guestName: string;
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  onGuestEmailChange: (value: string) => void;
  onGuestNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
}

export const CalendarInviteForm: React.FC<CalendarInviteFormProps> = props => {
  return <CalendarInviteFormFields {...props} />;
};
