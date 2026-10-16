import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReplyFooterSendRequest } from 'types/replySend';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { NO_FOLLOW_UP_HOURS } from 'constants/followUp';
import { REPLY_MODE_FORWARD } from 'constants/strings';
import { useFollowUpDuration } from 'hooks/useFollowUpDuration';

export { DEFAULT_FOLLOW_UP_DURATION } from 'constants/followUp';

export interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  replyMode?: 'reply' | 'replyAll' | 'forward';
  /** True when the last tone check failed; swaps Send for a hold-to-confirm button. */
  toneCheckFailed?: boolean;
  scheduledSendAt?: Date | null;
  /** Per-message open-tracking choice, owned by the composer so every send path sees it. */
  isTrackingOpens: boolean;
  onTrackOpensChange: (isTracking: boolean) => void;
  onClose: () => void;
  onSend: (request: ReplyFooterSendRequest) => void;
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

  const followUp = useFollowUpDuration();
  const { followUpDuration, setFollowUpDuration, trimmedDuration, hasFollowUp } = followUp;
  const [keepInAction, setKeepInAction] = useState<boolean>(false);
  const [showSchedulePopup, setShowSchedulePopup] = useState<boolean>(false);
  const scheduleButtonRef = useRef<HTMLDivElement>(null);

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
  const dispatchSend = (scheduledAt?: Date, draftOverride?: string) => {
    const followUpWindow = hasFollowUp
      ? { expectedReplyDuration: trimmedDuration }
      : { expectedReplyHours: NO_FOLLOW_UP_HOURS };
    onSend({ ...followUpWindow, draftOverride, scheduledSendAt: scheduledAt, keepInAction });
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
    expectedReplyTooltip: followUp.tooltipText,
    handleSend,
    handleSendAnyway,
    handleScheduleIconClick,
    handleSelectSuggestion,
    handlePickCustom,
  };
};
