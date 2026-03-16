import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED } from 'constants/numbers';

const MAX_MESSAGE_LENGTH = 5000;

// TODO(#949): Screenshot upload UI is not yet implemented.
// The backend presigned-URL endpoint (POST /feedback/screenshot) is ready.
// See https://github.com/Focus-Bear/BearlyMail/issues/949 for the follow-up task.

interface Props {
  message: string;
  setMessage: (v: string) => void;
  isSubmitting: boolean;
  submitted: boolean;
  onClose: () => void;
  handleSubmit: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

export const FeedbackForm: React.FC<Props> = ({ message, setMessage, isSubmitting, submitted, onClose, handleSubmit, t }) => {
  return (
    <>
      <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, margin: 0 }}>
        {t('contactFeedback.description')}
      </p>

      {submitted ? (
        <div
          style={{
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          ✅ {t('contactFeedback.submitSuccess')}
        </div>
      ) : (
        <>
          <div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('contactFeedback.placeholder')}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={6}
              disabled={isSubmitting}
              aria-label={t('contactFeedback.messagelabel')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
                backgroundColor: theme.colors.background.paper,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            />
            <div
              style={{
                textAlign: 'right',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                marginTop: theme.spacing.xs,
              }}
            >
              {message.length} / {MAX_MESSAGE_LENGTH}
            </div>
          </div>

          <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
                background: 'none',
                color: theme.colors.text.secondary,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.common.white,
                cursor: isSubmitting || !message.trim() ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                opacity: isSubmitting || !message.trim() ? OPACITY_DISABLED : 1,
              }}
            >
              {isSubmitting ? t('contactFeedback.submitting') : t('contactFeedback.submit')}
            </button>
          </div>
        </>
      )}
    </>
  );
};
