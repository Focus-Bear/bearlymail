import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCalendar } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { HoldToConfirmButton } from 'components/common/HoldToConfirmButton';
import { InlineSpinner } from 'components/common/InlineSpinner';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { SchedulePopup } from './SchedulePopup';

interface ButtonRowProps {
  isDisabled: boolean;
  sending: boolean;
  checkingTone: boolean;
  showSchedulePopup: boolean;
  buttonText: string;
  /** True when the last tone check failed; swaps Send for a hold-to-confirm button. */
  toneCheckFailed?: boolean;
  onClose: () => void;
  onSend: () => void;
  onSendAnyway?: () => void;
  onScheduleIconClick: () => void;
  onSelectSuggestion: (date: Date) => void;
  onPickCustom: () => void;
  onCloseSchedulePopup: () => void;
}

/**
 * Cancel / Send / Schedule-icon button row at the bottom of the reply composer.
 */
export const ButtonRow: React.FC<ButtonRowProps> = ({
  isDisabled,
  sending,
  checkingTone,
  showSchedulePopup,
  buttonText,
  toneCheckFailed = false,
  onClose,
  onSend,
  onSendAnyway,
  onScheduleIconClick,
  onSelectSuggestion,
  onPickCustom,
  onCloseSchedulePopup,
}) => {
  const { t } = useTranslation();
  const isCancelDisabled = sending || checkingTone;
  const scheduleButtonRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-start', alignItems: 'center' }}>
      <button
        onClick={onClose}
        disabled={isCancelDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: isCancelDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>

      {toneCheckFailed && onSendAnyway ? (
        <HoldToConfirmButton
          label={t('emailDetail.sendAnywayHold')}
          holdMessage={t('emailDetail.sendAnywayHoldMessage')}
          onConfirm={onSendAnyway}
          disabled={isDisabled}
        />
      ) : (
        <button
          onClick={onSend}
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
            minWidth: '120px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {(checkingTone || sending) && <InlineSpinner size={14} />}
          {buttonText}
        </button>
      )}

      <div ref={scheduleButtonRef} style={{ position: 'relative' }}>
        <button
          onClick={onScheduleIconClick}
          disabled={isDisabled}
          title={t('emailDetail.schedule')}
          aria-label={t('emailDetail.schedule')}
          aria-expanded={showSchedulePopup}
          aria-haspopup="dialog"
          style={{
            padding: `${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: isDisabled ? theme.colors.text.tertiary : theme.colors.primary.main,
            border: `1px solid ${isDisabled ? theme.colors.border.light : theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.md,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.md,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FiCalendar size={16} />
        </button>

        {showSchedulePopup && (
          <SchedulePopup
            onSelectSuggestion={onSelectSuggestion}
            onPickCustom={onPickCustom}
            onClose={onCloseSchedulePopup}
          />
        )}
      </div>
    </div>
  );
};
