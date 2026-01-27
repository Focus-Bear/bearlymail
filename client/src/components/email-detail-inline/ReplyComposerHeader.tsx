import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_WRITE, EMOJI_CLOSE, EMOJI_FORWARD } from 'constants/emojis';
import { REPLY_MODE_REPLY_ALL, REPLY_MODE_FORWARD } from 'constants/strings';

interface ReplyComposerHeaderProps {
  replyMode: 'reply' | 'replyAll' | 'forward';
  onClose: () => void;
}

const getHeaderTitle = (replyMode: 'reply' | 'replyAll' | 'forward', t: (key: string) => string): string => {
  if (replyMode === REPLY_MODE_FORWARD) {
    return t('emailDetail.forward');
  }
  if (replyMode === REPLY_MODE_REPLY_ALL) {
    return t('emailDetail.replyAll');
  }
  return t('emailDetail.reply');
};

export const ReplyComposerHeader: React.FC<ReplyComposerHeaderProps> = ({
  replyMode,
  onClose,
}) => {
  const { t } = useTranslation();
  const isForward = replyMode === REPLY_MODE_FORWARD;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '1.2rem' }}>{isForward ? EMOJI_FORWARD : EMOJI_WRITE}</span>
        <strong style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.lg }}>
          {getHeaderTitle(replyMode, t)}
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


