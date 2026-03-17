import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE, EMOJI_FORWARD, EMOJI_WRITE } from 'constants/emojis';
import { REPLY_MODE_FORWARD } from 'constants/strings';

import { getHeaderTitle } from './replyComposerHeader.helpers';

interface ReplyComposerHeaderProps {
  replyMode: 'reply' | 'replyAll' | 'forward';
  onClose: () => void;
}

export const ReplyComposerHeader: React.FC<ReplyComposerHeaderProps> = ({ replyMode, onClose }) => {
  const { t } = useTranslation();
  const isForward = replyMode === REPLY_MODE_FORWARD;

  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
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
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};
