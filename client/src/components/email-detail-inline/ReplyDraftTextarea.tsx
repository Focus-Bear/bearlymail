import React from 'react';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';

interface ReplyDraftTextareaProps {
  draft: string | null;
  loadingReplies: boolean;
  hasToneError: boolean;
  onDraftChange: (draft: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onPasteFiles?: (files: File[]) => void;
  /** Called when a pasted image is registered as a CID inline attachment. */
  onInlineImage?: (cid: string, file: File) => void;
}

const ReplyDraftTextareaInner: React.FC<ReplyDraftTextareaProps> = ({
  draft,
  loadingReplies,
  hasToneError,
  onDraftChange,
  onPasteFiles,
  onInlineImage,
}) => {
  return (
    <RichTextEditor
      content={draft}
      onChange={onDraftChange}
      placeholder={loadingReplies ? 'Generating reply suggestions...' : 'Type your reply here...'}
      disabled={false}
      hasToneError={hasToneError}
      onPasteFiles={onPasteFiles}
      onInlineImage={onInlineImage}
    />
  );
};

/**
 * Wrapped with React.memo so the TipTap editor doesn't re-mount when the
 * parent (ReplyComposer) re-renders for unrelated state changes (e.g. tone
 * check updates, attachment list changes).  Requires stable `onDraftChange`
 * — ensured by wrapping the handler in useCallback in useReplyComposerState.
 */
export const ReplyDraftTextarea = React.memo(ReplyDraftTextareaInner);
