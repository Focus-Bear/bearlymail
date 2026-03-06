import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatScheduledTime } from 'utils/dateUtils';

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

function SendButtonContent({ sending, sendSuccess, checkingTone }: { sending: boolean; sendSuccess: boolean; checkingTone: boolean }) {
  const { t } = useTranslation();
  if (checkingTone) {
    return (
      <>
        <span style={SPINNER_STYLE} />
        {t('emailDetail.checkingTone')}
      </>
    );
  }
  if (sending) {
    return (
      <>
        <span style={SPINNER_STYLE} />
        {t('compose.sending')}
      </>
    );
  }
  if (sendSuccess) {
    return <>{t('compose.sent')}</>;
  }
  return <>{t('compose.send')}</>;
}

export const ComposeActions: React.FC<ComposeActionsProps> = ({
  sending,
  sendSuccess,
  checkingTone = false,
  onDiscard,
  onSend,
  onSchedule,
  scheduledSendAt,
  onClearSchedule,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', color: theme.colors.primary.main, fontSize: theme.typography.fontSize.sm }}>
          <span>🕐</span>
          <span>{t('compose.scheduledFor', { time: formatScheduledTime(scheduledSendAt) })}</span>
          {onClearSchedule && (
            <button
              onClick={onClearSchedule}
              title={t('compose.clearSchedule')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.text.tertiary, fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
      )}
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
          <SendButtonContent sending={sending} sendSuccess={sendSuccess} checkingTone={checkingTone} />
        </button>
      </div>
      <style>{SPIN_KEYFRAMES}</style>
    </div>
  );
};
