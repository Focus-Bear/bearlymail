import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
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

interface ExpectedReplyOptionButtonProps {
  option: typeof EXPECTED_REPLY_OPTIONS[0];
  selected: boolean;
  disabled: boolean;
  onSelect: (value: number) => void;
  getLabel: (option: typeof EXPECTED_REPLY_OPTIONS[0]) => string;
}

const ExpectedReplyOptionButton: React.FC<ExpectedReplyOptionButtonProps> = ({ option, selected, disabled, onSelect, getLabel }) => (
  <button
    key={option.value}
    onClick={() => onSelect(option.value)}
    disabled={disabled}
    style={{
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      backgroundColor: selected ? theme.colors.primary.main : theme.colors.background.subtle,
      color: selected ? 'white' : theme.colors.text.secondary,
      border: `1px solid ${selected ? theme.colors.primary.main : theme.colors.border.light}`,
      borderRadius: theme.borderRadius.sm,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: theme.typography.fontSize.xs,
      fontWeight: selected ? theme.typography.fontWeight.medium : theme.typography.fontWeight.normal,
      transition: 'all 0.15s ease',
    }}
  >{getLabel(option)}</button>
);

interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  scheduledSendAt?: Date | null;
  onClose: () => void;
  onSend: (expectedReplyHours?: number, draftOverride?: string, scheduledSendAt?: Date) => void;
  onSchedule?: () => void;
}

export const ReplyComposerFooter: React.FC<ReplyComposerFooterProps> = ({
  sending,
  checkingTone,
  draft,
  scheduledSendAt,
  onClose,
  onSend,
  onSchedule,
}) => {
  const { t } = useTranslation();
  const [expectedReplyHours, setExpectedReplyHours] = useState<number>(DEFAULT_EXPECTED_REPLY_HOURS);

  const isDisabled = !draft || sending || checkingTone;

  const getButtonText = (): string => {
    if (checkingTone) return t('emailDetail.checkingTone');
    return sending ? t('emailDetail.sending') : t('emailDetail.send');
  };
  const handleSend = () => { captureEvent('reply_sent', { expected_reply_hours: expectedReplyHours > 0 ? expectedReplyHours : null }); onSend(expectedReplyHours, undefined, scheduledSendAt || undefined); };
  const getOptionLabel = (option: typeof EXPECTED_REPLY_OPTIONS[0]): string =>
    option.labelKey === LABEL_KEY_NONE ? t('emailDetail.expectedReply.none') : t(`emailDetail.expectedReply.${option.labelKey}`, { count: option.count });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span style={{ 
          fontSize: theme.typography.fontSize.sm, 
          color: theme.colors.text.secondary,
          whiteSpace: 'nowrap',
        }}>
          {t('emailDetail.expectedReply.label')}:
        </span>
        <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          {EXPECTED_REPLY_OPTIONS.map((option) => (
            <ExpectedReplyOptionButton
              key={option.value} option={option}
              selected={expectedReplyHours === option.value}
              disabled={sending || checkingTone}
              onSelect={setExpectedReplyHours}
              getLabel={getOptionLabel}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          disabled={sending || checkingTone}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: (sending || checkingTone) ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
        {onSchedule && (
          <button
            onClick={onSchedule}
            disabled={isDisabled}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: isDisabled ? theme.colors.text.tertiary : theme.colors.primary.main,
              border: `1px solid ${isDisabled ? theme.colors.border.light : theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {t('emailDetail.schedule')}
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






