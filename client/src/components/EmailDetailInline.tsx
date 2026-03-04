import React, { useCallback,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { TimePicker } from 'components/compose/TimePicker';
import { EmailDetailContent,EmailNotFound, LoadingSpinner, ReplyComposer } from 'components/email-detail-inline';
import { API_URL } from 'config/api';
import { ACTION_TYPE_CUSTOM } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { useEmailDetailInline } from 'hooks/useEmailDetailInline';
import { useScheduledEmails } from 'hooks/useScheduledEmails';

// Immediate log when module loads

interface EmailDetailInlineProps {
  emailId: string;
  onClose?: () => void;
  onArchive?: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount?: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
  onBlockSender?: (emailId: string) => void;
  autoGenerateReplies?: boolean;
}

/**
 * Email detail inline component with full features
 * Displays email details in an inline/split view with all features from full view
 */
const useEmailDetailInlineHandlers = (
  emailId: string,
  onClose?: () => void,
  autoGenerateReplies?: boolean,
) => {
  const { t } = useTranslation();
  const { showSuccess } = useNotifications();
  const hookData = useEmailDetailInline(emailId, { autoGenerateReplies });

  const handleSendReplyWithClose = async (
    files: File[], 
    expectedReplyHours?: number, 
    forwardAttachmentIds?: string[], 
    draftOverride?: string,
    scheduledSendAt?: Date
  ) => {
    try {
      await hookData.handleSendReply(files, expectedReplyHours, forwardAttachmentIds, undefined, draftOverride, scheduledSendAt);
      // Refresh thread emails to show the sent reply
      await hookData.fetchThreadEmails();
      if (onClose) {
        const successMessage = scheduledSendAt 
          ? t('emailDetail.replyScheduledSuccess') 
          : t('emailDetail.replySentSuccess');
        showSuccess(successMessage);
        onClose();
      }
    } catch (error) {
      // Error notification is handled in handleSendReply
    }
  };

  const handleDraftChange = (newDraft: string) => {
    hookData.setDraft(newDraft);
    hookData.setToneCheckResult(null);
    if (hookData.replyOptions && hookData.selectedReplyOption !== hookData.replyOptions.length - 1) {
      const customIdx = hookData.replyOptions.findIndex(option => option.label === ACTION_TYPE_CUSTOM);
      if (customIdx >= 0) hookData.setSelectedReplyOption(customIdx);
    }
  };

  const handleReplyComposerClose = () => {
    hookData.setShowReplyComposer(false);
    hookData.setDraft('');
    hookData.setReplyOptions(null);
    hookData.setToneCheckResult(null);
  };

  const handleReplyOptionSelect = (idx: number, text: string) => {
    hookData.setSelectedReplyOption(idx);
    hookData.setDraft(text);
  };

  const handleToggleNotesCollapsed = () => {
    hookData.setNotesCollapsed(!hookData.notesCollapsed);
  };

  return {
    ...hookData,
    handleSendReplyWithClose,
    handleDraftChange,
    handleReplyComposerClose,
    handleReplyOptionSelect,
    handleToggleNotesCollapsed,
  };
};

export const EmailDetailInline: React.FC<EmailDetailInlineProps> = ({
  emailId,
  onClose,
  onArchive,
  onSetStarCount,
  onBlockSender,
  autoGenerateReplies = false,
}) => {
  const navigate = useNavigate();
  const [timeWarning, setTimeWarning] = useState<string | undefined>();
  const [suggestedTime, setSuggestedTime] = useState<Date | undefined>();

  const {
    timeSuggestions,
    checkSendTime,
    fetchTimeSuggestions,
  } = useScheduledEmails();

  const {
    email,
    threadEmails,
    expandedThreadItems,
    noteContent,
    actionItems,
    newActionItem,
    loading,
    notesCollapsed,
    githubLinks,
    loadingGithub,
    hasGithubToken,
    replyOptions,
    selectedReplyOption,
    showReplyComposer,
    replyMode,
    replyRecipients,
    replyCc,
    replyBcc,
    showCc,
    showBcc,
    draft,
    loadingReplies,
    sending,
    checkingTone,
    toneCheckResult,
    disputing,
    disputeResult,
    isGeneratingSummary,
    replyGenerationDebugInfo,
    initialAttachments,
    showTimePicker,
    scheduledSendAt,
    setNoteContent,
    setNewActionItem,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    refreshGithubInfo,
    handleSaveNote,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleExtractActions,
    handleOpenReplyComposer,
    toggleThreadItem,
    handleSendReplyWithClose,
    handleDraftChange,
    handleReplyComposerClose,
    handleReplyOptionSelect,
    handleToggleNotesCollapsed,
    handleOpenTimePicker: openTimePickerBase,
    handleTimeSelect: setScheduledTime,
    handleCancelTimePicker,
    disputeToneCheck,
  } = useEmailDetailInlineHandlers(emailId, onClose, autoGenerateReplies);

  const handleOpenTimePicker = useCallback(() => {
    fetchTimeSuggestions();
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    openTimePickerBase();
  }, [fetchTimeSuggestions, openTimePickerBase]);

  const handleTimeSelect = useCallback(async (time: Date) => {
    const checkResult = await checkSendTime(time);
    if (!checkResult.isAppropriate) {
      setTimeWarning(checkResult.warning);
      setSuggestedTime(checkResult.suggestion ? new Date(checkResult.suggestion) : undefined);
    } else {
      setTimeWarning(undefined);
      setSuggestedTime(undefined);
      setScheduledTime(time);
    }
  }, [checkSendTime, setScheduledTime]);

  const handleCancelTimePickerWithReset = useCallback(() => {
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    handleCancelTimePicker();
  }, [handleCancelTimePicker]);

  // Block sender handler
  const handleBlockSender = useCallback(async (emailIdToBlock: string) => {
    if (onBlockSender) {
      onBlockSender(emailIdToBlock);
    } else {
      // Fallback implementation
      captureEvent('email_block_sender_clicked', { email_id: emailIdToBlock });
      try {
        await axios.post(`${API_URL}/emails/${emailIdToBlock}/block-sender`);
        if (onClose) {
          onClose();
        } else {
          navigate('/inbox');
        }
      } catch (error) {
        console.error('Error blocking sender:', error);
      }
    }
  }, [onBlockSender, onClose, navigate]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!email) {
    return <EmailNotFound />;
  }

  return (
    <>
      <EmailDetailContent
        email={email}
        emailId={emailId}
        threadEmails={threadEmails}
        expandedThreadItems={expandedThreadItems}
        noteContent={noteContent}
        notesCollapsed={notesCollapsed}
        actionItems={actionItems}
        newActionItem={newActionItem}
        isGeneratingSummary={isGeneratingSummary}
        githubLinks={githubLinks}
        loadingGithub={loadingGithub}
        hasGithubToken={hasGithubToken}
        onNoteContentChange={setNoteContent}
        onToggleNotesCollapsed={handleToggleNotesCollapsed}
        onSaveNote={handleSaveNote}
        onNewActionItemChange={setNewActionItem}
        onAddActionItem={handleAddActionItem}
        onToggleActionItem={handleToggleActionItem}
        onDeleteActionItem={handleDeleteActionItem}
        onExtractActions={handleExtractActions}
        onRefreshGithub={refreshGithubInfo}
        onToggleThreadItem={toggleThreadItem}
        onArchive={onArchive}
        onSetStarCount={onSetStarCount}
        onOpenReplyComposer={handleOpenReplyComposer}
        onBlockSender={handleBlockSender}
      />
      <ReplyComposer
        showReplyComposer={showReplyComposer}
        replyMode={replyMode}
        replyRecipients={replyRecipients}
        replyCc={replyCc}
        replyBcc={replyBcc}
        showCc={showCc}
        showBcc={showBcc}
        draft={draft}
        replyOptions={replyOptions}
        selectedReplyOption={selectedReplyOption}
        loadingReplies={loadingReplies}
        checkingTone={checkingTone}
        toneCheckResult={toneCheckResult}
        sending={sending}
        initialAttachments={initialAttachments}
        debugInfo={replyGenerationDebugInfo}
        currentEmailId={emailId}
        currentEmailObjectId={email?.id}
        currentEmailThreadId={(email as any)?.emailThreadId}
        scheduledSendAt={scheduledSendAt}
        onReplyRecipientsChange={setReplyRecipients}
        onCcChange={setReplyCc}
        onBccChange={setReplyBcc}
        onShowCc={() => setShowCc(true)}
        onShowBcc={() => setShowBcc(true)}
        onDraftChange={handleDraftChange}
        onReplyOptionSelect={handleReplyOptionSelect}
        onClose={handleReplyComposerClose}
        onSend={handleSendReplyWithClose}
        onUseRevisedText={handleDraftChange}
        onDispute={disputeToneCheck}
        disputing={disputing}
        disputeResult={disputeResult}
        onSchedule={handleOpenTimePicker}
      />
      {showTimePicker && (
        <TimePicker
          selectedTime={scheduledSendAt}
          suggestions={timeSuggestions}
          onTimeSelect={handleTimeSelect}
          onCancel={handleCancelTimePickerWithReset}
          warning={timeWarning}
          suggestedTime={suggestedTime}
        />
      )}
    </>
  );
};
