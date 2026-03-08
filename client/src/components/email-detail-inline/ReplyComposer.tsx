import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ReplyComposerAttachments } from 'components/email-detail-inline/ReplyComposerAttachments';
import { ReplyComposerDebugPanel } from 'components/email-detail-inline/ReplyComposerDebugPanel';
import { ReplyComposerFooter } from 'components/email-detail-inline/ReplyComposerFooter';
import { ReplyComposerHeader } from 'components/email-detail-inline/ReplyComposerHeader';
import { ReplyDraftTextarea } from 'components/email-detail-inline/ReplyDraftTextarea';
import { ForwardedAttachmentsList } from 'components/email-detail-inline/ReplyForwardedAttachments';
import { ReplyOptionsSelector } from 'components/email-detail-inline/ReplyOptionsSelector';
import { ReplyRecipientsInput } from 'components/email-detail-inline/ReplyRecipientsInput';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { ReplyGenerationDebugInfo } from 'hooks/useReplyDraftGeneration';

const EMPTY_ATTACHMENTS: EmailAttachment[] = [];
const DRAG_OVERLAY_OPACITY = 0.95;

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
  debugInfo?: ReplyGenerationDebugInfo | null;
  currentEmailId?: string;
  currentEmailObjectId?: string;
  currentEmailThreadId?: string;
  scheduledSendAt?: Date | null;
  onReplyRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onDraftChange: (draft: string) => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onClose: () => void;
  onSend: (
    files: File[],
    expectedReplyHours?: number,
    forwardAttachmentIds?: string[],
    draftOverride?: string,
    scheduledSendAt?: Date,
    keepInAction?: boolean
  ) => void;
  onUseRevisedText: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onDispute?: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
  onScheduleForMorning?: () => void;
}

const useDragFiles = (onFilesAdded: (newFiles: File[]) => void) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current++;
    if (event.dataTransfer?.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      const droppedFiles = event.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        onFilesAdded(Array.from(droppedFiles));
      }
    },
    [onFilesAdded]
  );

  return { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop };
};

const useReplyComposerState = (
  initialAttachments: EmailAttachment[],
  onClose: () => void,
  onSend: ReplyComposerProps['onSend'],
  onDraftChange: (draft: string) => void,
  onUseRevisedText: (text: string) => void
) => {
  const [files, setFiles] = useState<File[]>([]);
  const [forwardAttachmentIds, setForwardAttachmentIds] = useState<string[]>([]);
  const prevAttachmentsRef = useRef<string>('');

  useEffect(() => {
    const attachmentIdsString = initialAttachments.map(attachment => attachment.attachmentId).join(',');
    if (attachmentIdsString !== prevAttachmentsRef.current) {
      prevAttachmentsRef.current = attachmentIdsString;
      setForwardAttachmentIds(initialAttachments.map(attachment => attachment.attachmentId));
    }
  }, [initialAttachments]);

  const handlePasteFiles = useCallback((pastedFiles: File[]) => {
    setFiles(prev => [...prev, ...pastedFiles]);
  }, []);

  const handleRemoveForwardAttachment = (attachmentId: string) => {
    setForwardAttachmentIds(prev => prev.filter(id => id !== attachmentId));
  };

  const handleDraftChange = (newDraft: string) => {
    onDraftChange(newDraft);
  };

  const handleSend = (
    expectedReplyHours?: number,
    draftOverride?: string,
    scheduledAt?: Date,
    keepInAction?: boolean
  ) => {
    onSend(
      files,
      expectedReplyHours,
      forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined,
      draftOverride,
      scheduledAt,
      keepInAction
    );
    setFiles([]);
    setForwardAttachmentIds([]);
  };

  const handleClose = () => {
    setFiles([]);
    setForwardAttachmentIds([]);
    onClose();
  };

  const handleUseRevisedText = (text: string) => {
    onUseRevisedText(text);
    handleSend(undefined, text, undefined, false);
  };

  return {
    files,
    setFiles,
    forwardAttachmentIds,
    handlePasteFiles,
    handleRemoveForwardAttachment,
    handleDraftChange,
    handleSend,
    handleClose,
    handleUseRevisedText,
  };
};

interface DragOverlayProps {
  dropText: string;
}

const DragOverlay: React.FC<DragOverlayProps> = ({ dropText }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.primary.light,
      opacity: DRAG_OVERLAY_OPACITY,
      borderRadius: theme.borderRadius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `2px dashed ${theme.colors.primary.main}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: theme.spacing.sm }}>📎</div>
      <div
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: FONT_WEIGHT_SEMIBOLD,
          color: theme.colors.primary.main,
        }}
      >
        {dropText}
      </div>
    </div>
  </div>
);

interface ReplyComposerBodyProps {
  replyMode: ReplyComposerProps['replyMode'];
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
  scheduledSendAt?: Date | null;
  files: File[];
  forwardAttachments: EmailAttachment[];
  debugInfo?: ReplyGenerationDebugInfo | null;
  currentEmailId?: string;
  currentEmailObjectId?: string;
  currentEmailThreadId?: string;
  isAdmin: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onDispute?: ReplyComposerProps['onDispute'];
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
  onScheduleForMorning?: () => void;
  onReplyRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onDraftChange: (draft: string) => void;
  onPasteFiles: (pastedFiles: File[]) => void;
  onFilesChange: (files: File[]) => void;
  onRemoveForwardAttachment: (attachmentId: string) => void;
  onUseRevisedText: (text: string) => void;
  onClose: () => void;
  onSend: (expectedReplyHours?: number, draftOverride?: string, scheduledAt?: Date, keepInAction?: boolean) => void;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
}

const ReplyComposerBody: React.FC<ReplyComposerBodyProps> = ({
  replyMode, replyRecipients, replyCc, replyBcc, showCc, showBcc,
  draft, replyOptions, selectedReplyOption, loadingReplies,
  checkingTone, toneCheckResult, sending, scheduledSendAt,
  files, forwardAttachments, debugInfo, currentEmailId,
  currentEmailObjectId, currentEmailThreadId, isAdmin, textareaRef,
  onDispute, disputing, disputeResult, onScheduleForMorning,
  onReplyRecipientsChange, onCcChange, onBccChange, onShowCc, onShowBcc,
  onReplyOptionSelect, onDraftChange, onPasteFiles, onFilesChange,
  onRemoveForwardAttachment, onUseRevisedText, onClose, onSend,
  onSchedule, onClearSchedule,
}) => (
  <>
    <ReplyComposerHeader replyMode={replyMode} onClose={onClose} />
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
      onDraftChange={onDraftChange}
      textareaRef={textareaRef}
      onPasteFiles={onPasteFiles}
    />
    <ReplyComposerAttachments files={files} onFilesChange={onFilesChange} />
    <ForwardedAttachmentsList attachments={forwardAttachments} onRemove={onRemoveForwardAttachment} />
    <ToneCheckResult
      toneCheckResult={toneCheckResult}
      onUseRevisedText={onUseRevisedText}
      emailText={draft || ''}
      onDispute={onDispute}
      disputing={disputing}
      disputeResult={disputeResult}
      onScheduleForMorning={onScheduleForMorning}
    />
    {isAdmin && (
      <ReplyComposerDebugPanel
        debugInfo={debugInfo}
        currentEmailId={currentEmailId}
        currentEmailObjectId={currentEmailObjectId}
        currentEmailThreadId={currentEmailThreadId}
        replyOptions={replyOptions}
      />
    )}
    <ReplyComposerFooter
      sending={sending}
      checkingTone={checkingTone}
      draft={draft}
      scheduledSendAt={scheduledSendAt}
      onClose={onClose}
      onSend={onSend}
      onSchedule={onSchedule}
      onClearSchedule={onClearSchedule}
    />
  </>
);

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  showReplyComposer, replyMode, replyRecipients, replyCc, replyBcc,
  showCc, showBcc, draft, replyOptions, selectedReplyOption,
  loadingReplies, checkingTone, toneCheckResult, sending,
  initialAttachments, debugInfo, currentEmailId, currentEmailObjectId,
  currentEmailThreadId, scheduledSendAt, onReplyRecipientsChange,
  onCcChange, onBccChange, onShowCc, onShowBcc, onDraftChange,
  onReplyOptionSelect, onClose, onSend, onUseRevisedText, textareaRef,
  onDispute, disputing, disputeResult, onSchedule, onClearSchedule,
  onScheduleForMorning,
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const attachments = initialAttachments ?? EMPTY_ATTACHMENTS;
  const {
    files, setFiles, forwardAttachmentIds,
    handlePasteFiles, handleRemoveForwardAttachment,
    handleDraftChange, handleSend, handleClose, handleUseRevisedText,
  } = useReplyComposerState(attachments, onClose, onSend, onDraftChange, onUseRevisedText);
  const { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useDragFiles(
    newFiles => setFiles(prev => [...prev, ...newFiles])
  );

  if (!showReplyComposer) {
    return null;
  }

  const forwardAttachmentsToShow = attachments.filter(
    attachment => forwardAttachmentIds.includes(attachment.attachmentId)
  );
  const bodyProps: ReplyComposerBodyProps = {
    replyMode, replyRecipients, replyCc, replyBcc, showCc, showBcc,
    draft, replyOptions, selectedReplyOption, loadingReplies,
    checkingTone, toneCheckResult, sending, scheduledSendAt,
    files, forwardAttachments: forwardAttachmentsToShow,
    debugInfo, currentEmailId, currentEmailObjectId, currentEmailThreadId,
    isAdmin: !!user?.isAdmin, textareaRef,
    onDispute, disputing, disputeResult, onScheduleForMorning,
    onReplyRecipientsChange, onCcChange, onBccChange, onShowCc, onShowBcc,
    onReplyOptionSelect, onDraftChange: handleDraftChange,
    onPasteFiles: handlePasteFiles, onFilesChange: setFiles,
    onRemoveForwardAttachment: handleRemoveForwardAttachment,
    onUseRevisedText: handleUseRevisedText,
    onClose: handleClose, onSend: handleSend, onSchedule, onClearSchedule,
  };

  return (
    <div
      className="animate-fade-in"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        marginBottom: theme.spacing.xl,
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${isDragging ? theme.colors.primary.main : theme.colors.primary.light}`,
        boxShadow: theme.shadows.md,
        position: 'relative',
      }}
    >
      {isDragging && <DragOverlay dropText={t('compose.dropFilesToAttach')} />}
      <ReplyComposerBody {...bodyProps} />
    </div>
  );
};
