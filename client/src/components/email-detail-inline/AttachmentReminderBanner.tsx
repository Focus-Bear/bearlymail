import React from 'react';

import { ComposerAdvisoryBanner } from 'components/email-detail-inline/ComposerAdvisoryBanner';
import { EMOJI_WARNING } from 'constants/emojis';

interface AttachmentReminderBannerProps {
  /** Reminder message returned by the tone-check LLM. Null/undefined = do not render. */
  attachmentReminder: string | null | undefined;
}

/**
 * Displays a non-blocking banner when the LLM detects that the email text
 * references an attachment (e.g. "see attached") but no file has been added.
 * The server suppresses this whenever the composer actually carries files, so
 * it never fires against an attachment the user already added.
 */
export const AttachmentReminderBanner: React.FC<AttachmentReminderBannerProps> = ({ attachmentReminder }) => (
  <ComposerAdvisoryBanner message={attachmentReminder} emoji={EMOJI_WARNING} emojiLabel="warning" />
);
