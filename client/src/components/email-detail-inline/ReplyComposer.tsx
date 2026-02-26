import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme } from 'theme/theme';
import { ReplyOptionsSelector } from 'components/email-detail-inline/ReplyOptionsSelector';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { ReplyComposerHeader } from 'components/email-detail-inline/ReplyComposerHeader';
import { ReplyRecipientsInput } from 'components/email-detail-inline/ReplyRecipientsInput';
import { ReplyDraftTextarea } from 'components/email-detail-inline/ReplyDraftTextarea';
import { ReplyComposerFooter } from 'components/email-detail-inline/ReplyComposerFooter';
import { ReplyComposerAttachments } from 'components/email-detail-inline/ReplyComposerAttachments';
import { ReplyGenerationDebugInfo } from 'hooks/useReplyDraftGeneration';
import { useAuth } from 'contexts/AuthContext';

const EMPTY_ATTACHMENTS: EmailAttachment[] = [];
const DRAG_OVERLAY_OPACITY = 0.95;
const DEBUG_PANEL_LINE_HEIGHT = 1.6;
const DEBUG_PANEL_PREVIEW_LENGTH = 50;

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
  onReplyRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
  onShowCc: () => void;
  onShowBcc: () => void;
  onDraftChange: (draft: string) => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onClose: () => void;
  onSend: (files: File[], expectedReplyHours?: number, forwardAttachmentIds?: string[], draftOverride?: string) => void;
  onUseRevisedText: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onDispute?: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
  onSchedule?: () => void;
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
  initialAttachments,
  debugInfo,
  currentEmailId,
  currentEmailObjectId,
  currentEmailThreadId,
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
  onSchedule,
}) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [forwardAttachmentIds, setForwardAttachmentIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const prevAttachmentsRef = useRef<string>('');
  const dragCounterRef = useRef(0);

  const attachments = initialAttachments ?? EMPTY_ATTACHMENTS;

  useEffect(() => {
    const attachmentIdsString = attachments.map(a => a.attachmentId).join(',');
    if (attachmentIdsString !== prevAttachmentsRef.current) {
      prevAttachmentsRef.current = attachmentIdsString;
      setForwardAttachmentIds(attachments.map(a => a.attachmentId));
    }
  }, [attachments]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles = Array.from(droppedFiles);
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  // Handle paste files from textarea
  const handlePasteFiles = useCallback((pastedFiles: File[]) => {
    setFiles(prev => [...prev, ...pastedFiles]);
  }, []);

  if (!showReplyComposer) {
    return null;
  }

  const handleRemoveForwardAttachment = (attachmentId: string) => {
    setForwardAttachmentIds(prev => prev.filter(id => id !== attachmentId));
  };

  const handleDraftChange = (newDraft: string) => {
    onDraftChange(newDraft);
  };

  const handleSend = (expectedReplyHours?: number, draftOverride?: string) => {
    onSend(files, expectedReplyHours, forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined, draftOverride);
    setFiles([]);
    setForwardAttachmentIds([]);
  };

  const handleClose = () => {
    setFiles([]);
    setForwardAttachmentIds([]);
    onClose();
  };

  const forwardAttachmentsToShow = attachments.filter(
    a => forwardAttachmentIds.includes(a.attachmentId)
  );

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
      {/* Drag overlay */}
      {isDragging && (
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
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <div style={{ fontSize: '2rem', marginBottom: theme.spacing.sm }}>📎</div>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <div style={{ fontSize: theme.typography.fontSize.lg, fontWeight: 600, color: theme.colors.primary.main }}>
              Drop files to attach
            </div>
          </div>
        </div>
      )}
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
        onPasteFiles={handlePasteFiles}
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
        onUseRevisedText={(text) => {
          onUseRevisedText(text);
          handleSend(undefined, text);
        }}
        emailText={draft || ''}
        onDispute={onDispute}
        disputing={disputing}
        disputeResult={disputeResult}
      />
      {/* eslint-disable i18next/no-literal-string, react/no-array-index-key */}
      {user?.isAdmin && (debugInfo || currentEmailId) && (
        <div style={{
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          backgroundColor: '#fff3e0',
          border: '1px solid #ffb74d',
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.xs,
          fontFamily: 'monospace',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.xs, color: '#e65100' }}>
            Reply Generation Debug (Admin Only)
          </div>
          <div style={{ color: theme.colors.text.secondary, lineHeight: DEBUG_PANEL_LINE_HEIGHT }}>
            <div><strong>Current State:</strong></div>
            <div style={{ marginLeft: theme.spacing.md }}>
              <div>Prop emailId: {currentEmailId || 'N/A'}</div>
              <div>Email object ID: {currentEmailObjectId || 'N/A'}</div>
              <div>Email threadId: {currentEmailThreadId || 'N/A'}</div>
              <div style={{
                backgroundColor: currentEmailId === currentEmailObjectId ? '#e8f5e9' : '#ffebee',
                padding: '2px 4px',
                borderRadius: '2px',
                display: 'inline-block',
              }}>
                ID Match: {currentEmailId === currentEmailObjectId ? 'YES' : 'NO - MISMATCH!'}
              </div>
            </div>
            {debugInfo && (
              <>
                <div style={{ marginTop: theme.spacing.sm }}><strong>Generation Debug Info:</strong></div>
                <div style={{ marginLeft: theme.spacing.md }}>
                  <div>Generated for emailId: {debugInfo.propEmailId}</div>
                  <div>Email object ID at generation: {debugInfo.emailObjectId || 'N/A'}</div>
                  <div>Thread ID used for fetch: {debugInfo.threadIdUsedForFetch || 'N/A'}</div>
                  <div>Last generated for: {debugInfo.lastGeneratedForEmailId || 'N/A'}</div>
                  <div>Timestamp: {debugInfo.timestamp}</div>
                  <div style={{
                    backgroundColor: debugInfo.propEmailId === currentEmailId ? '#e8f5e9' : '#ffebee',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    display: 'inline-block',
                    marginTop: '4px',
                  }}>
                    Generated for current email: {debugInfo.propEmailId === currentEmailId ? 'YES' : 'NO - STALE DATA!'}
                  </div>
                </div>
              </>
            )}
            {replyOptions && replyOptions.length > 0 && (
              <>
                <div style={{ marginTop: theme.spacing.sm }}><strong>Reply Options ({replyOptions.length}):</strong></div>
                <div style={{ marginLeft: theme.spacing.md }}>
                  {replyOptions.map((opt, idx) => (
                    <div key={idx}>[{idx}] {opt.label}: {opt.text.substring(0, DEBUG_PANEL_PREVIEW_LENGTH)}...</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* eslint-enable i18next/no-literal-string, react/no-array-index-key */}
      <ReplyComposerFooter
        sending={sending}
        checkingTone={checkingTone}
        draft={draft}
        onClose={handleClose}
        onSend={handleSend}
        onSchedule={onSchedule}
      />
    </div>
  );
};

