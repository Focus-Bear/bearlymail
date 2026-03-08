import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatScheduledTime } from 'utils/dateUtils';
import { captureEvent } from 'utils/posthog';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const DEFAULT_EXPECTED_REPLY_HOURS = 48;

const LABEL_KEY_NONE = 'none';
const LABEL_KEY_HOURS = 'hours';
const LABEL_KEY_DAYS = 'days';

const EXPECTED_REPLY_OPTIONS = [
  { value: 0, labelKey: LABEL_KEY_NONE },
  { value: 24, labelKey: LABEL_KEY_HOURS, count: 24 },
  { value: 48, labelKey: LABEL_KEY_HOURS, count: 48 },
  { value: 72, labelKey: LABEL_KEY_DAYS, count: 3 },
  { value: 168, labelKey: LABEL_KEY_DAYS, count: 7 },
];

interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  scheduledSendAt?: Date | null;
  onClose: () => void;
  onSend: (expectedReplyHours?: number, draftOverride?: string, scheduledSendAt?: Date, keepInAction?: boolean) => void;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
}

// eslint-disable-next-line max-lines-per-function, complexity -- ReplyComposerFooter handles scheduled send display, expected-reply options, keepInAction checkbox, and send/cancel controls in a single cohesive component
export const ReplyComposerFooter: React.FC<ReplyComposerFooterProps> = ({
  sending,
  checkingTone,
  draft,
  scheduledSendAt,
  onClose,
  onSend,
  onSchedule,
  onClearSchedule,
}) => {
  const { t } = useTranslation();
  const [expectedReplyHours, setExpectedReplyHours] = useState<number>(DEFAULT_EXPECTED_REPLY_HOURS);
  const [keepInAction, setKeepInAction] = useState<boolean>(false);

  const isDisabled = !draft || sending || checkingTone;

  const getButtonText = (): string => {
    if (checkingTone) {
      return t('emailDetail.checkingTone');
    }
    return sending ? t('emailDetail.sending') : t('emailDetail.send');
  };

  const getOptionLabel = (option: (typeof EXPECTED_REPLY_OPTIONS)[0]): string => {
    if (option.labelKey === LABEL_KEY_NONE) {
      return t('emailDetail.expectedReply.none');
    }
    return t(`emailDetail.expectedReply.${option.labelKey}`, { count: option.count });
  };

  const handleSend = () => {
    captureEvent('reply_sent', { expected_reply_hours: expectedReplyHours > 0 ? expectedReplyHours : null });
    onSend(expectedReplyHours, undefined, scheduledSendAt || undefined, keepInAction);
  };

  const handleExpectedReplyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setExpectedReplyHours(Number(event.target.value));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      {scheduledSendAt && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <span>🕐</span>
          <span>{t('compose.scheduledFor', { time: formatScheduledTime(scheduledSendAt) })}</span>
          {onClearSchedule && (
            <button
              onClick={onClearSchedule}
              title={t('compose.clearSchedule')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.colors.text.tertiary,
                fontSize: '14px',
                padding: '0 2px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            whiteSpace: 'nowrap',
          }}
        >
          {t('emailDetail.expectedReply.label')}:
        </span>
        <select
          value={expectedReplyHours}
          onChange={handleExpectedReplyChange}
          disabled={sending || checkingTone}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.subtle,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.xs,
            cursor: sending || checkingTone ? 'not-allowed' : 'pointer',
          }}
        >
          {EXPECTED_REPLY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {getOptionLabel(option)}
            </option>
          ))}
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={keepInAction}
            onChange={event => setKeepInAction(event.target.checked)}
            disabled={sending || checkingTone}
            style={{ cursor: sending || checkingTone ? 'not-allowed' : 'pointer' }}
          />
          {t('emailDetail.keepInAction')}
        </label>
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={onClose}
          disabled={sending || checkingTone}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: sending || checkingTone ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
        {onSchedule && (
          <button
            onClick={onSchedule}
            disabled={isDisabled}
            title={t('emailDetail.schedule')}
            style={{
              padding: `${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: isDisabled ? theme.colors.text.tertiary : theme.colors.primary.main,
              border: `1px solid ${isDisabled ? theme.colors.border.light : theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.md,
              lineHeight: 1,
            }}
            aria-label={t('emailDetail.schedule')}
          >
            📅
          </button>
        )}
        <button
          onClick={handleSend}
          disabled={isDisabled}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: isDisabled ? theme.colors.background.subtle : theme.colors.primary.main,
            color: isDisabled ? theme.colors.text.tertiary : 'white',
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
};
