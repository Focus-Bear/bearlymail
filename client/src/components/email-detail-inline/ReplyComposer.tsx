import React, { useState, useEffect } from 'react';
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

interface DisputeResult {
  accepted: boolean;
  rulesToRemove: string[];
  explanation: string;
  rulesUpdated: boolean;
  remainingRules: string[];
}

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ReplyComposerProps {
  showReplyComposer: boolean;
  replyMode: 'reply' | 'replyAll' | 'forward';
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
  initialAttachments?: EmailAttachment[];
  onReplyRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onDraftChange: (draft: string) => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onClose: () => void;
  onSend: (files: File[], expectedReplyHours?: number, forwardAttachmentIds?: string[]) => void;
  onUseRevisedText: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onDispute?: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
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
  initialAttachments = [],
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
  onDispute,
  disputing,
  disputeResult,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [forwardAttachmentIds, setForwardAttachmentIds] = useState<string[]>([]);

  useEffect(() => {
    setForwardAttachmentIds(initialAttachments.map(a => a.attachmentId));
  }, [initialAttachments]);

  if (!showReplyComposer) {
    return null;
  }

  const handleRemoveForwardAttachment = (attachmentId: string) => {
    setForwardAttachmentIds(prev => prev.filter(id => id !== attachmentId));
  };

  const handleDraftChange = (newDraft: string) => {
    onDraftChange(newDraft);
    if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
      const customIdx = replyOptions.findIndex(opt => opt.label === REPLY_OPTION_LABEL_CUSTOM);
      if (customIdx >= 0) {
        // This will be handled by parent
      }
    }
  };

  const handleSend = (expectedReplyHours?: number) => {
    onSend(files, expectedReplyHours, forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined);
    setFiles([]);
    setForwardAttachmentIds([]);
  };

  const handleClose = () => {
    setFiles([]);
    setForwardAttachmentIds([]);
    onClose();
  };

  const forwardAttachmentsToShow = initialAttachments.filter(
    a => forwardAttachmentIds.includes(a.attachmentId)
  );

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
      {/* eslint-disable i18next/no-literal-string */}
      {forwardAttachmentsToShow.length > 0 && (
        <div style={{ marginTop: theme.spacing.md }}>
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}>
            Forwarded attachments:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
            {forwardAttachmentsToShow.map((attachment) => (
              <div
                key={attachment.attachmentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  padding: theme.spacing.xs,
                  backgroundColor: theme.colors.background.default,
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.sm,
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                <span>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: theme.colors.text.primary,
                    }}
                  >
                    {attachment.filename}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveForwardAttachment(attachment.attachmentId)}
                  style={{
                    padding: theme.spacing.xs,
                    backgroundColor: 'transparent',
                    color: theme.colors.text.secondary,
                    border: 'none',
                    borderRadius: theme.borderRadius.sm,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = theme.colors.error.main;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = theme.colors.text.secondary;
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* eslint-enable i18next/no-literal-string */}
      <ToneCheckResult
        toneCheckResult={toneCheckResult}
        onUseRevisedText={onUseRevisedText}
        emailText={draft || ''}
        onDispute={onDispute}
        disputing={disputing}
        disputeResult={disputeResult}
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

