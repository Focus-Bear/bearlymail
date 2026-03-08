import React from 'react';
import { Email } from 'types/email';

import { SnoozeButton } from 'components/inbox/actions/SnoozeButton';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';

interface SnoozeInputProps {
  email: Email;
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onSnooze: (emailId: string) => Promise<void>;
}

export const SnoozeInput: React.FC<SnoozeInputProps> = ({ email, snoozeInput, onSnooze }) => {
  if (snoozeInput.showSnoozeInput !== email.id) {
    return <SnoozeButton email={email} onShowSnooze={snoozeInput.showSnooze} />;
  }

  const snoozeValue = snoozeInput.getSnoozeValue(email.id);

  return (
    <SnoozeInputForm
      email={email}
      snoozeValue={snoozeValue}
      onValueChange={value => snoozeInput.setSnoozeValue(email.id, value)}
      onConfirm={() => onSnooze(email.id)}
      onCancel={() => snoozeInput.clearSnooze(email.id)}
    />
  );
};
