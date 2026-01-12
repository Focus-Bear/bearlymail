import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ReplyComposerFooterProps {
  sending: boolean;
  checkingTone: boolean;
  draft: string | null;
  onClose: () => void;
  onSend: () => void;
}

export const ReplyComposerFooter: React.FC<ReplyComposerFooterProps> = ({
  sending,
  checkingTone,
  draft,
  onClose,
  onSend,
}) => {
  const { t } = useTranslation();

  const isDisabled = !draft || sending || checkingTone;

  const getButtonText = (): string => {
    if (checkingTone) return t('emailDetail.checkingTone');
    if (sending) return t('emailDetail.sending');
    return t('emailDetail.send');
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end', marginTop: theme.spacing.md }}>
      <button
        onClick={onClose}
        disabled={sending || checkingTone}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: (sending || checkingTone) ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={onSend}
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: isDisabled ? theme.colors.background.subtle : theme.colors.primary.main,
          color: isDisabled ? theme.colors.text.tertiary : 'white',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {getButtonText()}
      </button>
    </div>
  );
};






