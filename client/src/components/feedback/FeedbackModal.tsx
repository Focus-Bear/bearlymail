import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';

import { FeedbackForm } from './FeedbackForm';

// Draft persistence: the typed message is mirrored to localStorage so an
// accidental close, navigation, or page refresh never loses it — it's restored
// when the modal reopens. The draft is cleared only on a successful send or when
// the user explicitly confirms discarding it.
const FEEDBACK_DRAFT_KEY = 'bearlymail.feedbackDraft';

const readDraft = (): string => {
  try {
    return localStorage.getItem(FEEDBACK_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
};

const writeDraft = (value: string): void => {
  try {
    localStorage.setItem(FEEDBACK_DRAFT_KEY, value);
  } catch {
    // localStorage unavailable (private mode / quota) — persistence is best-effort.
  }
};

const clearDraft = (): void => {
  try {
    localStorage.removeItem(FEEDBACK_DRAFT_KEY);
  } catch {
    // no-op
  }
};

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
  const [message, setMessage] = useState(readDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Mirror the draft to localStorage as the user types.
  useEffect(() => {
    writeDraft(message);
  }, [message]);

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
      // Sent successfully — the draft is no longer needed.
      clearDraft();
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

  // Guard against silently discarding typed feedback. Any user-initiated close
  // (X button, overlay click, Cancel) goes through here; if there's unsent text
  // we confirm first. The post-submit auto-close calls onClose() directly, so a
  // successful submission never triggers the prompt.
  const handleClose = () => {
    if (message.trim() && !submitted && !window.confirm(t('contactFeedback.discardConfirm'))) {
      return;
    }
    // Proceeding past the guard is an explicit discard (or nothing to keep), so
    // drop the saved draft. Accidental closes that never reach here (navigation,
    // refresh) leave the draft intact for restoration.
    clearDraft();
    onClose();
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleClose();
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
            onClick={handleClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              lineHeight: 1,
              padding: theme.spacing.xs,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        <FeedbackForm
          message={message}
          setMessage={setMessage}
          isSubmitting={isSubmitting}
          submitted={submitted}
          onClose={handleClose}
          handleSubmit={handleSubmit}
          t={t}
        />
      </div>
    </div>
  );
};
