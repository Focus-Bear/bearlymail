import React, { useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getAxiosErrorMessage } from 'utils/errors';

import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { CalendarInviteActions } from 'components/quick-actions/modals/CalendarInviteActions';
import { CalendarInviteForm } from 'components/quick-actions/modals/CalendarInviteForm';
import { CalendarModalHeader } from 'components/quick-actions/modals/CalendarModalHeader';
import { API_URL } from 'config/api';
import { ISO_DATETIME_STRING_LENGTH } from 'constants/numbers';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  MAX_DESCRIPTION_LENGTH,
  MODAL_WIDTH_MEDIUM,
  VIEWPORT_HEIGHT_90,
} from 'constants/numbers';

interface CalendarCreateInviteModalProps {
  email: {
    subject: string;
    body: string;
    from: string;
    fromName?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

const getDefaultStartTime = (): string => {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  now.setMinutes(0);
  return now.toISOString().slice(0, ISO_DATETIME_STRING_LENGTH);
};

export const CalendarCreateInviteModal: React.FC<CalendarCreateInviteModalProps> = ({ email, onClose, onSuccess }) => {
  const [guestEmail, setGuestEmail] = useState(email.from);
  const [guestName, setGuestName] = useState(email.fromName || '');
  const [title, setTitle] = useState(email.subject || '');
  const [description, setDescription] = useState(email.body?.substring(0, MAX_DESCRIPTION_LENGTH) || '');
  const [startTime, setStartTime] = useState(getDefaultStartTime());
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MEETING_DURATION_MINUTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!guestEmail || !startTime) {
      setError('Guest email and start time are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const startTimeISO = new Date(startTime).toISOString();

      await axios.post(`${API_URL}/suggested-actions/calendar/create-invite`, {
        guestEmail,
        guestName,
        title,
        description,
        startTime: startTimeISO,
        durationMinutes,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Failed to create calendar invite'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_MEDIUM}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <CalendarModalHeader title="📅 Create Calendar Invite" onClose={onClose} />
        <form onSubmit={handleSubmit}>
          <CalendarInviteForm
            guestEmail={guestEmail}
            guestName={guestName}
            title={title}
            description={description}
            startTime={startTime}
            durationMinutes={durationMinutes}
            onGuestEmailChange={setGuestEmail}
            onGuestNameChange={setGuestName}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onStartTimeChange={setStartTime}
            onDurationChange={setDurationMinutes}
          />
          {error && (
            <div
              style={{
                marginBottom: theme.spacing.md,
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.sunray.light4,
                border: `1px solid ${theme.colors.accent.error}`,
                borderRadius: theme.borderRadius.md,
                color: theme.colors.accent.error,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {error}
            </div>
          )}
          <CalendarInviteActions loading={loading} hasRequiredFields={!!guestEmail && !!startTime} onCancel={onClose} />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
