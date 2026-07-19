import React from 'react';
import { theme } from 'theme/theme';

import { EMOJI_WARNING } from 'constants/emojis';

interface AttachmentReminderBannerProps {
  /** Reminder message returned by the tone-check LLM. Null/undefined = do not render. */
  attachmentReminder: string | null | undefined;
}

/**
 * Displays a non-blocking banner when the LLM detects that the email text
 * references an attachment (e.g. "see attached") but no file appears to have
 * been added.  Rendered separately from ToneCheckResult so it is always
 * visible regardless of whether the tone check passed or failed.
 */
export const AttachmentReminderBanner: React.FC<AttachmentReminderBannerProps> = ({ attachmentReminder }) => {
  if (!attachmentReminder) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.warning}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
      }}
    >
      <span role="img" aria-label="warning">
        {EMOJI_WARNING}
      </span>
      <span>{attachmentReminder}</span>
    </div>
  );
};
