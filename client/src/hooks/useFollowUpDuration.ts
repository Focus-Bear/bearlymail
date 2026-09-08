import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_FOLLOW_UP_DURATION } from 'constants/followUp';

export interface FollowUpDurationState {
  /** Raw field value, including any whitespace the user typed. */
  followUpDuration: string;
  setFollowUpDuration: (value: string) => void;
  /** Field value ready to send; empty when the user cleared the field. */
  trimmedDuration: string;
  /** False when the field is empty — the user wants no follow-up. */
  hasFollowUp: boolean;
  /** Explains what the current value will do, for the info tooltip. */
  tooltipText: string;
  /** The value to send as `expectedReplyDuration`, or undefined for none. */
  expectedReplyDuration: string | undefined;
}

/**
 * Shared state for the "Expect a reply within …" field used by both the reply
 * composer and the compose page. The raw string is sent to the server and
 * parsed there exactly like a snooze, so the two composers stay in step.
 */
export const useFollowUpDuration = (): FollowUpDurationState => {
  const { t } = useTranslation();
  const [followUpDuration, setFollowUpDuration] = useState<string>(DEFAULT_FOLLOW_UP_DURATION);

  const trimmedDuration = followUpDuration.trim();
  const hasFollowUp = trimmedDuration.length > 0;

  return {
    followUpDuration,
    setFollowUpDuration,
    trimmedDuration,
    hasFollowUp,
    tooltipText: hasFollowUp
      ? t('emailDetail.expectedReply.tooltip', { time: trimmedDuration })
      : t('emailDetail.expectedReply.tooltipNoFollowUp'),
    expectedReplyDuration: hasFollowUp ? trimmedDuration : undefined,
  };
};
