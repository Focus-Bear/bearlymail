import React from 'react';
import { Email, GitHubLink, PriorityExplanation, SummaryDebugInfo } from 'types/email';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

export interface EmailDetailState {
  email: Email | null;
  setEmail: React.Dispatch<React.SetStateAction<Email | null>>;
  threadEmails: Email[];
  setThreadEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  expandedThreadItems: Set<string>;
  setExpandedThreadItems: (setter: (prev: Set<string>) => Set<string>) => void;
  noteContent: string;
  setNoteContent: (content: string) => void;
  notesCollapsed: boolean;
  setNotesCollapsed: (collapsed: boolean) => void;
  summary: string | null;
  setSummary: (summary: string | null) => void;
  summaryType: string;
  setSummaryType: (type: string) => void;
  isGeneratingSummary: boolean;
  setIsGeneratingSummary: (generating: boolean) => void;
  summaryCollapsed: boolean;
  setSummaryCollapsed: (collapsed: boolean) => void;
  summaryDebug: SummaryDebugInfo | null;
  setSummaryDebug: (debug: SummaryDebugInfo | null) => void;
  showRuleModal: boolean;
  setShowRuleModal: (show: boolean) => void;
  customRule: { whenToUse: string; howToSummarize: string };
  setCustomRule: (rule: { whenToUse: string; howToSummarize: string }) => void;
  customRules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>;
  setCustomRules: (rules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>) => void;
  actionItems: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>;
  setActionItems: React.Dispatch<
    React.SetStateAction<Array<{ id?: string; description: string; isCompleted: boolean; source: string }>>
  >;
  newActionItem: string;
  setNewActionItem: (item: string) => void;
  draft: string | null;
  setDraft: (draft: string | null) => void;
  replyOptions: Array<{ label: string; text: string }> | null;
  setReplyOptions: (options: Array<{ label: string; text: string }> | null) => void;
  selectedReplyOption: number;
  setSelectedReplyOption: (index: number) => void;
  showReplyComposer: boolean;
  setShowReplyComposer: (show: boolean) => void;
  replyMode: 'reply' | 'replyAll' | 'forward';
  setReplyMode: (mode: 'reply' | 'replyAll' | 'forward') => void;
  replyTargetEmailId: string | null;
  setReplyTargetEmailId: (emailId: string | null) => void;
  replyRecipients: string;
  setReplyRecipients: (recipients: string) => void;
  replyCc: string;
  setReplyCc: (cc: string) => void;
  replyBcc: string;
  setReplyBcc: (bcc: string) => void;
  replySubject: string;
  setReplySubject: (subject: string) => void;
  showCc: boolean;
  setShowCc: (show: boolean) => void;
  showBcc: boolean;
  setShowBcc: (show: boolean) => void;
  loadingReplies: boolean;
  setLoadingReplies: (loading: boolean) => void;
  sending: boolean;
  setSending: (sending: boolean) => void;
  toneCheckResult: {
    isOk: boolean;
    suggestions: string[];
    revisedText?: string;
    inappropriateTiming?: string | null;
  } | null;
  setToneCheckResult: (
    result: { isOk: boolean; suggestions: string[]; revisedText?: string; inappropriateTiming?: string | null } | null
  ) => void;
  checkingTone: boolean;
  setCheckingTone: (checking: boolean) => void;
  disputing: boolean;
  setDisputing: (disputing: boolean) => void;
  disputeResult: {
    accepted: boolean;
    rulesToRemove: string[];
    explanation: string;
    rulesUpdated: boolean;
    remainingRules: string[];
  } | null;
  setDisputeResult: (
    result: {
      accepted: boolean;
      rulesToRemove: string[];
      explanation: string;
      rulesUpdated: boolean;
      remainingRules: string[];
    } | null
  ) => void;
  autoSendCountdown: number | null;
  setAutoSendCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  snoozeInput: string;
  setSnoozeInput: (input: string) => void;
  showSnoozeInput: boolean;
  setShowSnoozeInput: (show: boolean) => void;
  priorityExplanation: PriorityExplanation | null;
  setPriorityExplanation: (explanation: PriorityExplanation | null) => void;
  showPriorityExplanation: boolean;
  setShowPriorityExplanation: (show: boolean) => void;
  githubLinks: GitHubLink[];
  setGithubLinks: (links: GitHubLink[]) => void;
  loadingGithub: boolean;
  setLoadingGithub: (loading: boolean) => void;
  hasGithubToken: boolean;
  setHasGithubToken: (hasToken: boolean) => void;
  suggestedActions: SuggestedAction[];
  setSuggestedActions: (actions: SuggestedAction[]) => void;
  loadingSuggestedActions: boolean;
  setLoadingSuggestedActions: (loading: boolean) => void;
  showQuickActionsMenu: boolean;
  setShowQuickActionsMenu: (show: boolean) => void;
  selectedAction: SuggestedAction | null;
  setSelectedAction: (action: SuggestedAction | null) => void;
  animationClass: string | null;
  setAnimationClass: (className: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export interface EmailDetailOperationsOptions {
  onArchiveComplete?: (emailId: string) => void;
  onSnoozeComplete?: (emailId: string) => void;
}
