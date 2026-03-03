import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ComposeActionsProps {
  sending: boolean;
  sendSuccess: boolean;
  checkingTone?: boolean;
  onDiscard: () => void;
  onSend: () => void;
  onSchedule?: () => void;
}

export const ComposeActions: React.FC<ComposeActionsProps> = ({
  sending,
  sendSuccess,
  checkingTone = false,
  onDiscard,
  onSend,
  onSchedule,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.lg,
        borderTop: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        backgroundColor: theme.colors.background.subtle,
      }}
    >
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
          disabled={sending || sendSuccess || checkingTone}
          style={{
            padding: '10px 20px',
            backgroundColor: COLOR_TRANSPARENT,
            border: `1px solid ${sending || sendSuccess || checkingTone ? theme.colors.border.light : theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.md,
            cursor: sending || sendSuccess || checkingTone ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: sending || sendSuccess || checkingTone ? theme.colors.text.tertiary : theme.colors.primary.main,
            transition: theme.transitions.default,
          }}
        >
          {t('compose.schedule')}
        </button>
      )}
      <button
        onClick={onSend}
        disabled={sending || sendSuccess || checkingTone}
        style={{
          padding: '10px 24px',
          backgroundColor: sending || sendSuccess || checkingTone ? theme.colors.primary.light : theme.colors.primary.main,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: sending || sendSuccess || checkingTone ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: COLOR_NAMED_WHITE,
          transition: theme.transitions.default,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {(() => {
          if (checkingTone) {
            return (
              <>
                <span style={{ 
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                {t('emailDetail.checkingTone')}
              </>
            );
          }
          if (sending) {
            return (
              <>
                <span style={{ 
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                {t('compose.sending')}
              </>
            );
          }
          if (sendSuccess) {
            return t('compose.sent');
          }
          return t('compose.send');
        })()}
      </button>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};





