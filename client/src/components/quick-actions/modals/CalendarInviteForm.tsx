import React from 'react';

import { CalendarInviteFormFields } from 'components/quick-actions/modals/CalendarInviteFormFields';

interface CalendarInviteFormProps {
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
}

export const CalendarInviteForm: React.FC<CalendarInviteFormProps> = props => {
  return <CalendarInviteFormFields {...props} />;
};
