import { useEmailDetailActionItems } from 'hooks/useEmailDetailActionItems';
import { useEmailDetailFetching } from 'hooks/useEmailDetailFetching';
import { useEmailDetailNotes } from 'hooks/useEmailDetailNotes';
import { useEmailDetailReplies } from 'hooks/useEmailDetailReplies';

interface UseEmailDetailInlineOptions {
  autoGenerateReplies?: boolean;
}

export const useEmailDetailInline = (
  emailId: string,
  options: UseEmailDetailInlineOptions = {},
) => {
  const { autoGenerateReplies = false } = options;

  const { email, threadEmails, expandedThreadItems, loading, githubLinks, loadingGithub,
    hasGithubToken, refreshGithubInfo, toggleThreadItem, fetchThreadEmails } = useEmailDetailFetching(emailId);

  const { noteContent, setNoteContent, notesCollapsed, setNotesCollapsed, handleSaveNote } = useEmailDetailNotes(email);

  const { actionItems, newActionItem, setNewActionItem, isGeneratingSummary,
    handleAddActionItem, handleToggleActionItem, handleDeleteActionItem, handleExtractActions } = useEmailDetailActionItems(email);

  const replies = useEmailDetailReplies(emailId, email, { autoGenerateReplies });

  return {
    email, threadEmails, expandedThreadItems, noteContent, actionItems, newActionItem,
    loading, notesCollapsed, githubLinks, loadingGithub, hasGithubToken, isGeneratingSummary,
    replyOptions: replies.replyOptions, selectedReplyOption: replies.selectedReplyOption,
    showReplyComposer: replies.showReplyComposer, replyMode: replies.replyMode,
    replyRecipients: replies.replyRecipients, replyCc: replies.replyCc, replyBcc: replies.replyBcc,
    showCc: replies.showCc, showBcc: replies.showBcc, draft: replies.draft,
    loadingReplies: replies.loadingReplies, sending: replies.sending,
    checkingTone: replies.checkingTone, toneCheckResult: replies.toneCheckResult,
    disputing: replies.disputing, disputeResult: replies.disputeResult,
    initialAttachments: replies.initialAttachments, replyGenerationDebugInfo: replies.replyGenerationDebugInfo,
    showTimePicker: replies.showTimePicker, scheduledSendAt: replies.scheduledSendAt,
    setNoteContent, setNewActionItem, setNotesCollapsed,
    setReplyRecipients: replies.setReplyRecipients, setReplyCc: replies.setReplyCc,
    setReplyBcc: replies.setReplyBcc, setShowCc: replies.setShowCc, setShowBcc: replies.setShowBcc,
    setDraft: replies.setDraft, setSelectedReplyOption: replies.setSelectedReplyOption,
    setShowReplyComposer: replies.setShowReplyComposer, setReplyOptions: replies.setReplyOptions,
    setToneCheckResult: replies.setToneCheckResult,
    refreshGithubInfo, handleSaveNote, handleAddActionItem, handleToggleActionItem,
    handleDeleteActionItem, handleExtractActions, toggleThreadItem, fetchThreadEmails,
    handleOpenReplyComposer: replies.handleOpenReplyComposer,
    handleSendReply: replies.handleSendReply,
    handleOpenTimePicker: replies.handleOpenTimePicker,
    handleTimeSelect: replies.handleTimeSelect,
    handleCancelTimePicker: replies.handleCancelTimePicker,
    disputeToneCheck: replies.disputeToneCheck,
    clearDisputeResult: replies.clearDisputeResult,
  };
};
