import React from 'react';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';

interface ReplyDraftTextareaProps {
  draft: string | null;
  loadingReplies: boolean;
  hasToneError: boolean;
  onDraftChange: (draft: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onPasteFiles?: (files: File[]) => void;
  /** Called when a pasted image is registered as a CID inline attachment. */
  onInlineImage?: (cid: string, file: File) => void;
}

export const ReplyDraftTextarea: React.FC<ReplyDraftTextareaProps> = ({
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
