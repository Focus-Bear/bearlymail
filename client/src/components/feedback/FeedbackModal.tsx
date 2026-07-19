import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';

import { FeedbackForm } from './FeedbackForm';

// Note: on success we set `submitted = true` which shows the inline ✅ state
// and auto-closes the modal after FEEDBACK_SUCCESS_CLOSE_MS. We intentionally
// do NOT also fire a toast — showing both simultaneously is redundant UX.

interface FeedbackModalProps {
  onClose: () => void;
}

const FEEDBACK_SUCCESS_CLOSE_MS = 1500;

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: theme.colors.overlay.dark,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: theme.spacing.md,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  boxShadow: theme.shadows.lg,
  width: '100%',
  maxWidth: '520px',
  padding: theme.spacing.xl,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.md,
};

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (screenshotKey?: string) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/feedback`, {
        message: trimmed,
        ...(screenshotKey ? { screenshotS3Key: screenshotKey } : {}),
      });
      // Show inline ✅ success state only (no duplicate toast).
      setSubmitted(true);
      setTimeout(() => onClose(), FEEDBACK_SUCCESS_CLOSE_MS);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      showError(t('contactFeedback.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            id="feedback-modal-title"
            style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.semibold,
              margin: 0,
            }}
          >
            {t('contactFeedback.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xl,
              color: theme.colors.text.secondary,
              lineHeight: 1,
              padding: theme.spacing.xs,
            }}
          >
            {t('common.close')}
          </button>
        </div>

        <FeedbackForm
          message={message}
          setMessage={setMessage}
          isSubmitting={isSubmitting}
          submitted={submitted}
          onClose={onClose}
          handleSubmit={handleSubmit}
          t={t}
        />
      </div>
    </div>
  );
};
