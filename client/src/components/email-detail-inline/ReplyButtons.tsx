import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_REPLY, EMOJI_REPLY_ALL } from 'constants/emojis';
import { STRING_NONE } from 'constants/strings';

interface ReplyButtonsProps {
  onReply: () => void;
  onReplyAll: () => void;
}

export const ReplyButtons: React.FC<ReplyButtonsProps> = ({ onReply, onReplyAll }) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.lg, display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
      <button
        onClick={onReply}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <span>{EMOJI_REPLY}</span>
        {t('emailDetail.reply')}
      </button>
      <button
        onClick={onReplyAll}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <span>{EMOJI_REPLY_ALL}</span>
        {t('emailDetail.replyAll')}
      </button>
    </div>
  );
};
