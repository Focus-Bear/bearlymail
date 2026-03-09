import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

export const DEFAULT_EXPECTED_REPLY_HOURS = 48;

const LABEL_KEY_NONE = 'none';
const LABEL_KEY_HOURS = 'hours';
const LABEL_KEY_DAYS = 'days';

export const EXPECTED_REPLY_OPTIONS = [
  { value: 0, labelKey: LABEL_KEY_NONE },
  { value: 24, labelKey: LABEL_KEY_HOURS, count: 24 },
  { value: 48, labelKey: LABEL_KEY_HOURS, count: 48 },
  { value: 72, labelKey: LABEL_KEY_DAYS, count: 3 },
  { value: 168, labelKey: LABEL_KEY_DAYS, count: 7 },
] as const;

export interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  scheduledSendAt?: Date | null;
  onClose: () => void;
  onSend: (expectedReplyHours?: number, draftOverride?: string, scheduledSendAt?: Date, keepInAction?: boolean) => void;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
}

/**
 * Manages all state and event handlers for ReplyComposerFooter.
 * Keeps the component itself a thin composition of sub-components.
 */
export const useReplyComposerFooter = (props: ReplyComposerFooterProps) => {
  const { sending, checkingTone, draft, scheduledSendAt, onSend, onSchedule } = props;
  const { t } = useTranslation();

  const [expectedReplyHours, setExpectedReplyHours] = useState<number>(DEFAULT_EXPECTED_REPLY_HOURS);
  const [keepInAction, setKeepInAction] = useState<boolean>(false);
  const [showSchedulePopup, setShowSchedulePopup] = useState<boolean>(false);
  const scheduleButtonRef = useRef<HTMLDivElement>(null);

  const isDisabled = !draft || sending || checkingTone;

  const getOptionLabel = (option: typeof EXPECTED_REPLY_OPTIONS[number]): string => {
    if (option.labelKey === LABEL_KEY_NONE) {
      return t('emailDetail.expectedReply.none');
    }
    return t(`emailDetail.expectedReply.${option.labelKey}`, { count: option.count });
  };

  const getSelectedOptionLabel = (): string => {
    const selected = EXPECTED_REPLY_OPTIONS.find((opt) => opt.value === expectedReplyHours);
    if (!selected || selected.value === 0) {
      return '';
    }
    return getOptionLabel(selected);
  };

  const getButtonText = (): string => {
    if (checkingTone) {
      return t('emailDetail.checkingTone');
    }
    return sending ? t('emailDetail.sending') : t('emailDetail.send');
  };

  const handleSend = () => {
    captureEvent(ANALYTICS_EVENTS.REPLY_SENT, { expected_reply_hours: expectedReplyHours > 0 ? expectedReplyHours : null });
    onSend(expectedReplyHours, undefined, scheduledSendAt || undefined, keepInAction);
  };

  const handleExpectedReplyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setExpectedReplyHours(Number(event.target.value));
  };

  const handleScheduleIconClick = () => {
    if (!isDisabled) {
      setShowSchedulePopup((prev) => !prev);
    }
  };

  const handleSelectSuggestion = (date: Date) => {
    setShowSchedulePopup(false);
    captureEvent(ANALYTICS_EVENTS.REPLY_SCHEDULED, { expected_reply_hours: expectedReplyHours > 0 ? expectedReplyHours : null });
    onSend(expectedReplyHours, undefined, date, keepInAction);
  };

  const handlePickCustom = () => {
    setShowSchedulePopup(false);
    if (onSchedule) {
      onSchedule();
    }
  };

  const expectedReplyTooltip = expectedReplyHours > 0
    ? t('emailDetail.expectedReply.tooltip', { time: getSelectedOptionLabel() })
    : t('emailDetail.expectedReply.tooltipNoFollowUp');

  return {
    expectedReplyHours,
    keepInAction,
    setKeepInAction,
    showSchedulePopup,
    setShowSchedulePopup,
    scheduleButtonRef,
    isDisabled,
    getButtonText,
    getOptionLabel,
    expectedReplyTooltip,
    handleSend,
    handleExpectedReplyChange,
    handleScheduleIconClick,
    handleSelectSuggestion,
    handlePickCustom,
  };
};
