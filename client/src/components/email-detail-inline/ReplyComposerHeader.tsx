import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_WRITE, EMOJI_CLOSE } from 'constants/emojis';

const REPLY_MODE_REPLY_ALL = 'replyAll';

interface ReplyComposerHeaderProps {
  replyMode: 'reply' | 'replyAll';
  onClose: () => void;
}

export const ReplyComposerHeader: React.FC<ReplyComposerHeaderProps> = ({
  replyMode,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '1.2rem' }}>{EMOJI_WRITE}</span>
        <strong style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.lg }}>
          {replyMode === REPLY_MODE_REPLY_ALL ? t('emailDetail.replyAll') : t('emailDetail.reply')}
        </strong>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.lg,
          padding: theme.spacing.xs,
        }}
        title={t('common.close')}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};


