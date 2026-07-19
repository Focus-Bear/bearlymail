import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatScheduledTime } from 'utils/dateUtils';

import { HoldToConfirmButton } from 'components/common/HoldToConfirmButton';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ComposeActionsProps {
  sending: boolean;
  sendSuccess: boolean;
  checkingTone?: boolean;
  onDiscard: () => void;
  onSend: () => void;
  onSchedule?: () => void;
  scheduledSendAt?: Date | null;
  onClearSchedule?: () => void;
  /** True when the last tone check failed; swaps Send for a hold-to-confirm button. */
  toneCheckFailed?: boolean;
  onSendAnyway?: () => void;
}

const SPINNER_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: '14px',
  height: '14px',
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: 'white',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const SPIN_KEYFRAMES = `@keyframes spin { to { transform: rotate(360deg); } }`;

function SendButtonContent({
  sending,
  sendSuccess,
  checkingTone,
  isScheduled,
}: {
  sending: boolean;
  sendSuccess: boolean;
  checkingTone: boolean;
  isScheduled: boolean;
}) {
  const { t } = useTranslation();
  if (checkingTone) {
    return (
      <>
        <span style={SPINNER_STYLE} role="status" />
        {t('emailDetail.checkingTone')}
      </>
    );
  }
  if (sending) {
    return (
      <>
        <span style={SPINNER_STYLE} role="status" />
        {t('compose.sending')}
      </>
    );
  }
  if (sendSuccess) {
    return <>{isScheduled ? t('compose.scheduled') : t('compose.sent')}</>;
  }
  return <>{isScheduled ? t('compose.scheduleSend') : t('compose.send')}</>;
}

interface ScheduledSendIndicatorProps {
  scheduledSendAt: Date;
  onClearSchedule?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const ScheduledSendIndicator: React.FC<ScheduledSendIndicatorProps> = ({ scheduledSendAt, onClearSchedule, t }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: theme.spacing.md,
      backgroundColor: theme.colors.primary.subtle,
      border: `1px solid ${theme.colors.primary.main}`,
      borderRadius: theme.borderRadius.md,
      color: theme.colors.primary.dark,
      fontSize: theme.typography.fontSize.sm,
    }}
  >
    <span>🕐</span>
    <span style={{ flex: 1 }}>{t('compose.scheduledBanner', { time: formatScheduledTime(scheduledSendAt) })}</span>
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
);

interface ComposeSendRowProps {
  isDisabled: boolean;
  sending: boolean;
  sendSuccess: boolean;
  checkingTone: boolean;
  isScheduled: boolean;
  toneCheckFailed: boolean;
  onDiscard: () => void;
  onSend: () => void;
  onSendAnyway?: () => void;
  onSchedule?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const ComposeSendRow: React.FC<ComposeSendRowProps> = ({
  isDisabled,
  sending,
  sendSuccess,
  checkingTone,
  isScheduled,
  toneCheckFailed,
  onDiscard,
  onSend,
  onSendAnyway,
  onSchedule,
  t,
}) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
    <button
      onClick={onDiscard}
      style={{
        padding: '10px 20px',
        backgroundColor: COLOR_TRANSPARENT,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
        color: theme.colors.text.secondary,
        transition: theme.transitions.default,
      }}
    >
      {t('compose.discard')}
    </button>
    {onSchedule && (
      <button
        onClick={onSchedule}
        disabled={isDisabled}
        style={{
          padding: '10px 20px',
          backgroundColor: COLOR_TRANSPARENT,
          border: `1px solid ${isDisabled ? theme.colors.border.light : theme.colors.primary.main}`,
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: isDisabled ? theme.colors.text.tertiary : theme.colors.primary.main,
          transition: theme.transitions.default,
        }}
      >
        {t('compose.schedule')}
      </button>
    )}
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
          padding: '10px 24px',
          backgroundColor: isDisabled ? theme.colors.primary.light : theme.colors.primary.main,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: COLOR_NAMED_WHITE,
          transition: theme.transitions.default,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <SendButtonContent
          sending={sending}
          sendSuccess={sendSuccess}
          checkingTone={checkingTone}
          isScheduled={isScheduled}
        />
      </button>
    )}
  </div>
);

export const ComposeActions: React.FC<ComposeActionsProps> = ({
  sending,
  sendSuccess,
  checkingTone = false,
  onDiscard,
  onSend,
  onSchedule,
  scheduledSendAt,
  onClearSchedule,
  toneCheckFailed = false,
  onSendAnyway,
}) => {
  const { t } = useTranslation();
  const isDisabled = sending || sendSuccess || checkingTone;

  return (
    <div
      style={{
        padding: theme.spacing.lg,
        borderTop: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      {scheduledSendAt && (
        <ScheduledSendIndicator scheduledSendAt={scheduledSendAt} onClearSchedule={onClearSchedule} t={t} />
      )}
      <ComposeSendRow
        isDisabled={isDisabled}
        sending={sending}
        sendSuccess={sendSuccess}
        checkingTone={checkingTone}
        isScheduled={!!scheduledSendAt}
        toneCheckFailed={toneCheckFailed}
        onDiscard={onDiscard}
        onSend={onSend}
        onSendAnyway={onSendAnyway}
        onSchedule={onSchedule}
        t={t}
      />
      <style>{SPIN_KEYFRAMES}</style>
    </div>
  );
};
