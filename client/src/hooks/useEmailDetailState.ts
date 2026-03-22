import { useState } from 'react';
import { useUserProfileQuery } from 'queries/useUserProfileQuery';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

interface EmailDetailEmail {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  body?: string;
  htmlBody?: string;
  receivedAt: string;
  summary?: string;
  isProcessingSummary?: boolean;
  phishingConfidence?: 'low' | 'medium' | 'high' | null;
  phishingReason?: string | null;
  githubMetadata?: {
    links: any[];
  };
}

export function useEmailDetailState() {
  // Seed GitHub token presence from TanStack Query cache (populated by auth/settings)
  const { data: userProfile } = useUserProfileQuery();

  // Email data state
  const [email, setEmail] = useState<EmailDetailEmail | null>(null);
  const [threadEmails, setThreadEmails] = useState<EmailDetailEmail[]>([]);
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Notes state
  const [noteContent, setNoteContent] = useState('');
  const [notesCollapsed, setNotesCollapsed] = useState(true);

  // Summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryType, setSummaryType] = useState<string>('tldr');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [customRule, setCustomRule] = useState({ whenToUse: '', howToSummarize: '' });
  const [customRules, setCustomRules] = useState<Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>>(
    []
  );

  // Action items state
  const [actionItems, setActionItems] = useState<
    Array<{ id?: string; description: string; isCompleted: boolean; source: string }>
  >([]);
  const [newActionItem, setNewActionItem] = useState('');

  // Reply state
  const [draft, setDraft] = useState<string | null>(null);
  const [replyOptions, setReplyOptions] = useState<Array<{ label: string; text: string }> | null>(null);
  const [selectedReplyOption, setSelectedReplyOption] = useState<number>(0);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll'>('reply');
  const [replyRecipients, setReplyRecipients] = useState<string>('');
  const [replyCc, setReplyCc] = useState<string>('');
  const [replyBcc, setReplyBcc] = useState<string>('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [toneCheckResult, setToneCheckResult] = useState<{
    isOk: boolean;
    suggestions: string[];
    revisedText?: string;
    attachmentReminder?: string | null;
    inappropriateTiming?: string | null;
  } | null>(null);
  const [checkingTone, setCheckingTone] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeResult, setDisputeResult] = useState<{
    accepted: boolean;
    rulesToRemove: string[];
    explanation: string;
    rulesUpdated: boolean;
    remainingRules: string[];
  } | null>(null);

  // Snooze state
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null);
  const [snoozeInput, setSnoozeInput] = useState<string>('');
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);

  // Priority explanation state
  const [priorityExplanation, setPriorityExplanation] = useState<{
    score: number;
    breakdown: Array<{ factor: string; value: number; description: string }>;
    dimensions?: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
    };
  } | null>(null);
  const [showPriorityExplanation, setShowPriorityExplanation] = useState(false);

  // GitHub state
  // loadingGithub starts true so the spinner shows immediately before the first
  // async fetch completes — prevents the false "no links" flash.
  // hasGithubToken is seeded from the TanStack Query cache so the UI never shows
  // the "Connect to GitHub" prompt during the ~200ms–1s fetch window (#1347).
  const [githubLinks, setGithubLinks] = useState<any[]>([]);
  const [loadingGithub, setLoadingGithub] = useState(true);
  const [hasGithubToken, setHasGithubToken] = useState(() => !!userProfile?.githubToken);

  // Quick actions state
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [loadingSuggestedActions, setLoadingSuggestedActions] = useState(false);
  const [showQuickActionsMenu, setShowQuickActionsMenu] = useState(false);
  const [selectedAction, setSelectedAction] = useState<SuggestedAction | null>(null);

  // UI state
  const [animationClass, setAnimationClass] = useState<string | null>(null);

  return {
    // Email data
    email,
    setEmail,
    threadEmails,
    setThreadEmails,
    expandedThreadItems,
    setExpandedThreadItems,
    loading,
    setLoading,

    // Notes
    noteContent,
    setNoteContent,
    notesCollapsed,
    setNotesCollapsed,

    // Summary
    summary,
    setSummary,
    summaryType,
    setSummaryType,
    isGeneratingSummary,
    setIsGeneratingSummary,
    summaryCollapsed,
    setSummaryCollapsed,
    showRuleModal,
    setShowRuleModal,
    customRule,
    setCustomRule,
    customRules,
    setCustomRules,

    // Action items
    actionItems,
    setActionItems,
    newActionItem,
    setNewActionItem,

    // Reply
    draft,
    setDraft,
    replyOptions,
    setReplyOptions,
    selectedReplyOption,
    setSelectedReplyOption,
    showReplyComposer,
    setShowReplyComposer,
    replyMode,
    setReplyMode,
    replyRecipients,
    setReplyRecipients,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    showCc,
    setShowCc,
    showBcc,
    setShowBcc,
    loadingReplies,
    setLoadingReplies,
    sending,
    setSending,
    toneCheckResult,
    setToneCheckResult,
    checkingTone,
    setCheckingTone,
    disputing,
    setDisputing,
    disputeResult,
    setDisputeResult,
    autoSendCountdown,
    setAutoSendCountdown,

    // Snooze
    snoozeInput,
    setSnoozeInput,
    showSnoozeInput,
    setShowSnoozeInput,

    // Priority
    priorityExplanation,
    setPriorityExplanation,
    showPriorityExplanation,
    setShowPriorityExplanation,

    // GitHub
    githubLinks,
    setGithubLinks,
    loadingGithub,
    setLoadingGithub,
    hasGithubToken,
    setHasGithubToken,

    // Quick actions
    suggestedActions,
    setSuggestedActions,
    loadingSuggestedActions,
    setLoadingSuggestedActions,
    showQuickActionsMenu,
    setShowQuickActionsMenu,
    selectedAction,
    setSelectedAction,

    // UI
    animationClass,
    setAnimationClass,
  };
}
