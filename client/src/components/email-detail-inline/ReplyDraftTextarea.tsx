import React from 'react';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED } from 'constants/numbers';

interface ReplyDraftTextareaProps {
  draft: string | null;
  loadingReplies: boolean;
  hasToneError: boolean;
  onDraftChange: (draft: string) => void;
}

export const ReplyDraftTextarea: React.FC<ReplyDraftTextareaProps> = ({
  draft,
  loadingReplies,
  hasToneError,
  onDraftChange,
}) => {
  return (
    <textarea
      value={draft || ''}
      onChange={(e) => onDraftChange(e.target.value)}
      placeholder={loadingReplies ? "Generating reply suggestions..." : "Type your reply here..."}
      disabled={loadingReplies}
      style={{
        width: '100%',
        minHeight: '200px',
        padding: theme.spacing.lg,
        border: `1px solid ${hasToneError ? theme.colors.accent.error : theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.base,
        opacity: loadingReplies ? OPACITY_DISABLED : 1,
        fontFamily: theme.typography.fontFamily,
        lineHeight: theme.typography.lineHeight.relaxed,
        backgroundColor: theme.colors.background.subtle,
        outline: 'none',
        resize: 'vertical',
      }}
    />
  );
};


