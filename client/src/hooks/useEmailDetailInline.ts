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
    draft,
    loadingReplies,
    sending,
    checkingTone,
    toneCheckResult,
    setReplyRecipients,
    setDraft,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyOptions,
    setToneCheckResult,
    handleOpenReplyComposer,
    handleSendReply,
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
    draft,
    loadingReplies,
    sending,
    checkingTone,
    toneCheckResult,
    isGeneratingSummary,
    setNoteContent,
    setNewActionItem,
    setNotesCollapsed,
    setReplyRecipients,
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
    toggleThreadItem,
  };
};

