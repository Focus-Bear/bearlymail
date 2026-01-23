import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { ReplyOptionsSelector } from 'components/email-detail-inline/ReplyOptionsSelector';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { ReplyComposerHeader } from 'components/email-detail-inline/ReplyComposerHeader';
import { ReplyRecipientsInput } from 'components/email-detail-inline/ReplyRecipientsInput';
import { ReplyDraftTextarea } from 'components/email-detail-inline/ReplyDraftTextarea';
import { ReplyComposerFooter } from 'components/email-detail-inline/ReplyComposerFooter';
import { ReplyComposerAttachments } from 'components/email-detail-inline/ReplyComposerAttachments';

const REPLY_OPTION_LABEL_CUSTOM = 'Custom';

interface ReplyOption {
  label: string;
  text: string;
}

interface ToneCheckResultData {
  isOk: boolean;
  suggestions: string[];
  revisedText?: string;
}

interface ReplyComposerProps {
  showReplyComposer: boolean;
  replyMode: 'reply' | 'replyAll';
  replyRecipients: string;
  replyCc: string;
  replyBcc: string;
  showCc: boolean;
  showBcc: boolean;
  draft: string | null;
  replyOptions: ReplyOption[] | null;
  selectedReplyOption: number;
  loadingReplies: boolean;
  checkingTone: boolean;
  toneCheckResult: ToneCheckResultData | null;
  sending: boolean;
  onReplyRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onDraftChange: (draft: string) => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onClose: () => void;
  onSend: (files: File[]) => void;
  onUseRevisedText: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  showReplyComposer,
  replyMode,
  replyRecipients,
  replyCc,
  replyBcc,
  showCc,
  showBcc,
  draft,
  replyOptions,
  selectedReplyOption,
  loadingReplies,
  checkingTone,
  toneCheckResult,
  sending,
  onReplyRecipientsChange,
  onCcChange,
  onBccChange,
  onShowCc,
  onShowBcc,
  onDraftChange,
  onReplyOptionSelect,
  onClose,
  onSend,
  onUseRevisedText,
  textareaRef,
}) => {
  const [files, setFiles] = useState<File[]>([]);

  if (!showReplyComposer) {
    return null;
  }

  const handleDraftChange = (newDraft: string) => {
    onDraftChange(newDraft);
    if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
      const customIdx = replyOptions.findIndex(opt => opt.label === REPLY_OPTION_LABEL_CUSTOM);
      if (customIdx >= 0) {
        // This will be handled by parent
      }
    }
  };

  const handleSend = () => {
    onSend(files);
    setFiles([]); // Clear files after sending
  };

  const handleClose = () => {
    setFiles([]); // Clear files when closing
    onClose();
  };

  return (
    <div className="animate-fade-in" style={{
      marginBottom: theme.spacing.xl,
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.primary.light}`,
      boxShadow: theme.shadows.md,
    }}>
      <ReplyComposerHeader replyMode={replyMode} onClose={handleClose} />
      <ReplyRecipientsInput
        replyRecipients={replyRecipients}
        replyCc={replyCc}
        replyBcc={replyBcc}
        showCc={showCc}
        showBcc={showBcc}
        onRecipientsChange={onReplyRecipientsChange}
        onCcChange={onCcChange}
        onBccChange={onBccChange}
        onShowCc={onShowCc}
        onShowBcc={onShowBcc}
      />
      <ReplyOptionsSelector
        loadingReplies={loadingReplies}
        replyOptions={replyOptions}
        selectedReplyOption={selectedReplyOption}
        onSelect={onReplyOptionSelect}
      />
      <ReplyDraftTextarea
        draft={draft}
        loadingReplies={loadingReplies}
        hasToneError={!!(toneCheckResult && !toneCheckResult.isOk)}
        onDraftChange={handleDraftChange}
        textareaRef={textareaRef}
      />
      <ReplyComposerAttachments
        files={files}
        onFilesChange={setFiles}
      />
      <ToneCheckResult
        toneCheckResult={toneCheckResult}
        onUseRevisedText={onUseRevisedText}
      />
      <ReplyComposerFooter
        sending={sending}
        checkingTone={checkingTone}
        draft={draft}
        onClose={handleClose}
        onSend={handleSend}
      />
    </div>
  );
};

