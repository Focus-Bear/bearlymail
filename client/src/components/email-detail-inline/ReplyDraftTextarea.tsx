import React, { useCallback } from 'react';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED } from 'constants/numbers';

interface ReplyDraftTextareaProps {
  draft: string | null;
  loadingReplies: boolean;
  hasToneError: boolean;
  onDraftChange: (draft: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onPasteFiles?: (files: File[]) => void;
}

export const ReplyDraftTextarea: React.FC<ReplyDraftTextareaProps> = ({
  draft,
  loadingReplies,
  hasToneError,
  onDraftChange,
  textareaRef,
  onPasteFiles,
}) => {
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || !onPasteFiles) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Check if item is a file (image, etc.)
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault(); // Prevent default paste behavior for files
      onPasteFiles(files);
    }
    // If no files, let the default paste behavior handle text
  }, [onPasteFiles]);

  return (
    <textarea
      ref={textareaRef}
      value={draft || ''}
      onChange={(e) => onDraftChange(e.target.value)}
      onPaste={handlePaste}
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


