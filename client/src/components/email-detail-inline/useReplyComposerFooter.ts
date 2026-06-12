import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { REPLY_MODE_FORWARD } from 'constants/strings';

/**
 * Default follow-up window pre-filled into the (editable) free-text input.
 * Clearing the field means "no follow-up".
 */
export const DEFAULT_FOLLOW_UP_DURATION = '48h';

// expectedReplyHours value that maps to "no follow-up" (archive after reply).
const NO_FOLLOW_UP_HOURS = 0;

export interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  replyMode?: 'reply' | 'replyAll' | 'forward';
  /** True when the last tone check failed; swaps Send for a hold-to-confirm button. */
  toneCheckFailed?: boolean;
  scheduledSendAt?: Date | null;
  onClose: () => void;
  onSend: (
    expectedReplyHours?: number,
    draftOverride?: string,
    scheduledSendAt?: Date,
    keepInAction?: boolean,
    expectedReplyDuration?: string
  ) => void;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
}

/**
 * Manages all state and event handlers for ReplyComposerFooter.
 * Keeps the component itself a thin composition of sub-components.
 */
export const useReplyComposerFooter = (props: ReplyComposerFooterProps) => {
  const { sending, checkingTone, draft, replyMode, scheduledSendAt, onSend, onSchedule } = props;
  const { t } = useTranslation();

  const [followUpDuration, setFollowUpDuration] = useState<string>(DEFAULT_FOLLOW_UP_DURATION);
  const [keepInAction, setKeepInAction] = useState<boolean>(false);
  const [showSchedulePopup, setShowSchedulePopup] = useState<boolean>(false);
  const scheduleButtonRef = useRef<HTMLDivElement>(null);

  const trimmedDuration = followUpDuration.trim();
  const hasFollowUp = trimmedDuration.length > 0;
  // Forwards may be sent without any added text — the original message is the content.
  const isMissingDraft = !draft && replyMode !== REPLY_MODE_FORWARD;
  const isDisabled = isMissingDraft || sending || checkingTone;

  const getButtonText = (): string => {
    if (checkingTone) {
      return t('emailDetail.checkingTone');
    }
    return sending ? t('emailDetail.sending') : t('emailDetail.send');
  };

  const followUpAnalytics = () => ({
    expected_reply_duration: hasFollowUp ? trimmedDuration : null,
  });

  // An empty field means "no follow-up" (archive after reply); otherwise the
  // raw duration string is sent and parsed server-side, exactly like a snooze.
  const dispatchSend = (sendAt?: Date, draftOverride?: string) => {
    if (hasFollowUp) {
      onSend(undefined, draftOverride, sendAt, keepInAction, trimmedDuration);
    } else {
      onSend(NO_FOLLOW_UP_HOURS, draftOverride, sendAt, keepInAction);
    }
  };

  const handleSend = () => {
    captureEvent(ANALYTICS_EVENTS.REPLY_SENT, followUpAnalytics());
    dispatchSend(scheduledSendAt || undefined);
  };

  // Passing the draft as draftOverride skips the tone check in the send handler,
  // so a failed tone check can be deliberately overridden via hold-to-confirm.
  const handleSendAnyway = () => {
    captureEvent(ANALYTICS_EVENTS.TONE_CHECK_SEND_ANYWAY, followUpAnalytics());
    dispatchSend(scheduledSendAt || undefined, draft ?? undefined);
  };

  const handleScheduleIconClick = () => {
    if (!isDisabled) {
      setShowSchedulePopup(prev => !prev);
    }
  };

  const handleSelectSuggestion = (date: Date) => {
    setShowSchedulePopup(false);
    captureEvent(ANALYTICS_EVENTS.REPLY_SCHEDULED, followUpAnalytics());
    dispatchSend(date);
  };

  const handlePickCustom = () => {
    setShowSchedulePopup(false);
    if (onSchedule) {
      onSchedule();
    }
  };

  const expectedReplyTooltip = hasFollowUp
    ? t('emailDetail.expectedReply.tooltip', { time: trimmedDuration })
    : t('emailDetail.expectedReply.tooltipNoFollowUp');

  return {
    followUpDuration,
    setFollowUpDuration,
    keepInAction,
    setKeepInAction,
    showSchedulePopup,
    setShowSchedulePopup,
    scheduleButtonRef,
    isDisabled,
    getButtonText,
    expectedReplyTooltip,
    handleSend,
    handleSendAnyway,
    handleScheduleIconClick,
    handleSelectSuggestion,
    handlePickCustom,
  };
};
