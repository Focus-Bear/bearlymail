import { useEmailDetailFetching } from 'hooks/useEmailDetailFetching';
import { useEmailDetailNotes } from 'hooks/useEmailDetailNotes';
import { useEmailDetailActionItems } from 'hooks/useEmailDetailActionItems';
import { useEmailDetailReplies } from 'hooks/useEmailDetailReplies';

interface UseEmailDetailInlineOptions {
  autoGenerateReplies?: boolean;
}

export const useEmailDetailInline = (
  emailId: string,
  options: UseEmailDetailInlineOptions = {},
) => {
  const { autoGenerateReplies = false } = options;

  const {
    email,
    threadEmails,
    expandedThreadItems,
    loading,
    githubLinks,
    loadingGithub,
    hasGithubToken,
    refreshGithubInfo,
    toggleThreadItem,
    fetchThreadEmails,
  } = useEmailDetailFetching(emailId);

  const {
    noteContent,
    setNoteContent,
    notesCollapsed,
    setNotesCollapsed,
    handleSaveNote,
  } = useEmailDetailNotes(email);

  const {
    actionItems,
    newActionItem,
    setNewActionItem,
    isGeneratingSummary,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleExtractActions,
  } = useEmailDetailActionItems(email);

  const {
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
    initialAttachments,
    replyGenerationDebugInfo,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setDraft,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyOptions,
    setToneCheckResult,
    handleOpenReplyComposer,
    handleSendReply,
    disputeToneCheck,
    clearDisputeResult,
  } = useEmailDetailReplies(emailId, email, { autoGenerateReplies });

  return {
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
    initialAttachments,
    isGeneratingSummary,
    replyGenerationDebugInfo,
    setNoteContent,
    setNewActionItem,
    setNotesCollapsed,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setDraft,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyOptions,
    setToneCheckResult,
    refreshGithubInfo,
    handleSaveNote,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleExtractActions,
    handleOpenReplyComposer,
    handleSendReply,
    disputeToneCheck,
    clearDisputeResult,
    toggleThreadItem,
    fetchThreadEmails,
  };
};

