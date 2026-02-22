import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'contexts/AuthContext';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { MODE_FOLLOW_UP, MODE_TRIAGE, MODE_ACTION } from 'constants/strings';
import { useEmailManagement } from 'hooks/useEmailManagement';
import { useTriageSuggestions } from 'hooks/useTriageSuggestions';
import { useEmailSelection } from 'hooks/useEmailSelection';
import { useBatchSchedule } from 'hooks/useBatchSchedule';
import { useTabCounts } from 'hooks/useTabCounts';
import { useKeyboardShortcuts } from 'hooks/useKeyboardShortcuts';
import { useOnboarding } from 'hooks/useOnboarding';
import { useDebugPanel } from 'hooks/useDebugPanel';
import { useModals } from 'hooks/useModals';
import { useSnoozeInput } from 'hooks/useSnoozeInput';
import { usePriorityTooltip } from 'hooks/usePriorityTooltip';
import { useKeyboardHint } from 'hooks/useKeyboardHint';
import { useSplitView } from 'hooks/useSplitView';
import { useUrgentNotification } from 'hooks/useUrgentNotification';
import { useEmailActions } from 'hooks/useEmailActions';
import { useFollowUps } from 'hooks/useFollowUps';
import { useEmailProcessingPolling } from 'hooks/useEmailProcessingPolling';
import { useInboxInitialization } from 'hooks/useInboxInitialization';
import { useInboxModeChanges } from 'hooks/useInboxModeChanges';
import { useInboxKeyboardNavigation } from 'hooks/useInboxKeyboardNavigation';
import { useGitHubBatchFetch } from 'hooks/useGitHubBatchFetch';
import { useInboxFilters } from 'hooks/useInboxFilters';

const VALID_MODES: InboxMode[] = [MODE_TRIAGE, MODE_ACTION, MODE_FOLLOW_UP];

function isValidMode(mode: string | undefined): mode is InboxMode {
  return mode !== undefined && VALID_MODES.includes(mode as InboxMode);
}

interface UseInboxStateOptions {
  isFocusedMode?: boolean;
}

// eslint-disable-next-line max-lines-per-function -- Inbox state hook requires managing multiple inbox states, modes, and operations
export function useInboxState(options: UseInboxStateOptions = {}) {
  const { isFocusedMode = false } = options;
  const { t } = useTranslation();
  const { user, logout, refreshUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { mode: urlMode, threadId: urlThreadId } = useParams<{ mode?: string; threadId?: string }>();
  
  const getInitialMode = (): InboxMode => {
    if (urlMode && isValidMode(urlMode)) {
      return urlMode;
    }
    return MODE_TRIAGE;
  };
  
  const [mode, setModeState] = useState<InboxMode>(getInitialMode);
  const isInitialMount = useRef(true);
  const lastUrlRef = useRef<string>('');

  // Triage suggestions hook
  const {
    triageSuggestions,
    loadingSuggestions,
    fetchTriageSuggestions,
    removeSuggestion,
    clearSuggestionsCache,
  } = useTriageSuggestions();

  // Tab counts hook - must be before useEmailManagement since it's passed to it
  const { tabCounts, fetchTabCounts, updateTabCountsOptimistically } = useTabCounts();

  // Inbox filters hook
  const inboxFilters = useInboxFilters();

  // Email management hook
  const emailManagement = useEmailManagement({
    mode,
    onSuggestionRemove: removeSuggestion,
    onTabCountsUpdateOptimistically: updateTabCountsOptimistically,
    filters: inboxFilters.filters,
  });
  const {
    emails,
    setEmails,
    loading,
    decrypting,
    loadingModeSwitch,
    setLoadingModeSwitch,
    fetchError,
    fetchEmails,
    loadMore,
    hasMore,
    handleSetStarCount: handleSetStarCountBase,
    handleArchive: handleArchiveBase,
    handleSnooze: handleSnoozeBase,
    handleMarkAsRead,
  } = emailManagement;

  // Batch schedule hook
  const { nextDelivery, lastUrgentCheck, fetchBatchStatus, updateLastUrgentCheck } = useBatchSchedule();

  // Email selection hook
  const {
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    handleEmailClick: handleEmailClickBase,
  } = useEmailSelection(mode, emails.length);

  // Follow-ups hook
  const {
    threads: followUpThreads,
    error: followUpsError,
    isGeneratingDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  } = useFollowUps();

  // Store follow-up data mapped by threadId
  const [followUpDataMap, setFollowUpDataMap] = useState<Map<string, any>>(new Map());

  // Category accordion state - stored here to persist across InboxContent remounts
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);

  // Fetch follow-up data when in follow-up mode
  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && user && !authLoading) {
      fetchThreadsWithDrafts();
    }
  }, [mode, user, authLoading, fetchThreadsWithDrafts, isGeneratingDrafts]);

  // Update follow-up data map when threads change
  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && followUpThreads.length > 0) {
      const map = new Map();
      followUpThreads.forEach((thread: any) => {
        if (thread.followUp) {
          map.set(thread.threadId, thread.followUp);
        }
      });
      setFollowUpDataMap(map);
    }
  }, [mode, followUpThreads]);

  // Hooks for state management
  const snoozeInput = useSnoozeInput();
  const onboarding = useOnboarding({
    user,
    authLoading,
    refreshUser,
  });
  const urgentNotification = useUrgentNotification();
  const debugPanel = useDebugPanel(() => fetchEmails());
  const modals = useModals();
  const priorityTooltip = usePriorityTooltip();
  const keyboardHint = useKeyboardHint();
  const splitView = useSplitView();

  // Initialization hook
  const { hasInitiallyLoaded, hasRunAnalysis } = useInboxInitialization({
    authLoading,
    user,
    fetchEmails,
    fetchBatchStatus,
    fetchTabCounts,
  });

  // Tour element refs
  const triageTabRef = useRef<HTMLButtonElement>(null);
  const actionTabRef = useRef<HTMLButtonElement>(null);
  const followUpTabRef = useRef<HTMLButtonElement>(null);
  const deliverBtnRef = useRef<HTMLButtonElement>(null);
  const emailListRef = useRef<HTMLDivElement>(null);
  const emailDetailRef = useRef<HTMLDivElement>(null);

  // Mode changes hook
  useInboxModeChanges({
    mode,
    hasInitiallyLoaded,
    user,
    authLoading,
    fetchEmails,
    fetchBatchStatus,
    fetchTabCounts,
    setEmails,
    setLoadingModeSwitch,
    clearSuggestionsCache,
    fetchTriageSuggestions,
    emails,
    loadingSuggestions,
  });

  const tourSteps = [
    { title: t('onboarding.tour.welcome'), content: t('onboarding.tour.welcomeContent') },
    { title: t('onboarding.tour.triageTitle'), content: t('onboarding.tour.triageContent') },
    { title: t('onboarding.tour.actionTitle'), content: t('onboarding.tour.actionContent') },
    { title: t('onboarding.tour.deliveryTitle'), content: t('onboarding.tour.deliveryContent') },
  ];

  // Email action handlers
  const emailActions = useEmailActions({
    mode,
    emails,
    setEmails,
    selectedEmailIds,
    setSelectedEmailIds,
    handleSetStarCountBase,
    handleArchiveBase,
    handleSnoozeBase,
    handleMarkAsRead,
    handleBulkMarkAsRead: emailManagement.handleBulkMarkAsRead,
    handleBulkMarkAsUnread: emailManagement.handleBulkMarkAsUnread,
    onShowStarDiscrepancy: modals.showStarDiscrepancy,
    onShowPriorityOverride: modals.showPriorityOverride,
    onShowBlockConfirm: modals.showBlockConfirm,
    onHideBlockConfirm: modals.hideBlockConfirm,
    blockConfirmEmail: modals.blockConfirmEmail,
    fetchEmails,
    snoozeInput,
    emailListRef,
    selectedEmailIndex,
    setSelectedEmailIndex,
    splitView,
    onTabCountsUpdateOptimistically: updateTabCountsOptimistically,
  });

  // Fetch GitHub metadata in batch after inbox loads
  useGitHubBatchFetch(emails, loading);

  // Poll for email updates when emails are actively processing
  useEmailProcessingPolling({
    emails,
    fetchEmails,
  });

  // Track inbox view
  useEffect(() => {
    if (user && !authLoading && hasInitiallyLoaded) {
      captureEvent('inbox_viewed', { mode });
    }
  }, [user, authLoading, hasInitiallyLoaded, mode]);

  // Handler for keyboard-based archive in split view
  // This archives the email and navigates to the next one
  const handleSplitViewArchiveFromKeyboard = useCallback((archivedEmailId: string) => {
    // First, archive the email
    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
    handleArchiveBase(archivedEmailId, fakeEvent);
    
    // Then navigate to the next email (same logic as onSplitViewArchive in Inbox.tsx)
    // Filter out the just-archived email to get the remaining visible emails
    const visibleEmails = emails.filter(e => !e.isArchived && e.id !== archivedEmailId);
    
    if (visibleEmails.length === 0) {
      splitView.closeEmail();
      return;
    }
    
    // Use the current index as the next index (since we removed the current email)
    const currentIndex = selectedEmailIndex >= 0 ? selectedEmailIndex : 0;
    const nextIndex = currentIndex < visibleEmails.length 
      ? currentIndex 
      : Math.max(0, visibleEmails.length - 1);
    
    const nextEmail = visibleEmails[nextIndex];
    if (nextEmail) {
      splitView.openEmail(nextEmail.id);
      setSelectedEmailIndex(nextIndex);
    } else {
      splitView.closeEmail();
    }
  }, [emails, selectedEmailIndex, handleArchiveBase, splitView, setSelectedEmailIndex]);

  // Use keyboard shortcuts hook
  const keyboardShortcuts = useKeyboardShortcuts({
    emails,
    selectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIndex,
    onArchive: handleArchiveBase,
    onSetStarCount: handleSetStarCountBase,
    emailListRef,
    emailDetailRef,
    splitViewSelectedEmailId: splitView.selectedEmailId,
    onSplitViewArchive: handleSplitViewArchiveFromKeyboard,
  });

  // Wrapper for email click that passes emails array
  const handleEmailClick = useCallback((emailId: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    handleEmailClickBase(emailId, index, e, emails);
  }, [handleEmailClickBase, emails]);

  // Handle email selection - use split view on desktop, navigate on mobile
  const handleEmailSelect = useCallback((emailId: string, e: React.MouseEvent) => {
    captureEvent('email_clicked', { email_id: emailId, mode });
    if (splitView.isMobile) {
      handleMarkAsRead(emailId);
      navigate(`/email/${emailId}`, { state: { fromMode: mode } });
    } else {
      handleMarkAsRead(emailId);
      splitView.openEmail(emailId);
      // Update selectedEmailIndex to match the email being opened in split view
      const visibleEmails = emails.filter(email => !email.isArchived);
      const emailIndex = visibleEmails.findIndex(email => email.id === emailId);
      if (emailIndex >= 0) {
        setSelectedEmailIndex(emailIndex);
      }
    }
  }, [splitView, handleMarkAsRead, navigate, mode, emails, setSelectedEmailIndex]);

  // Keyboard navigation
  useInboxKeyboardNavigation({
    emails,
    selectedEmailIndex,
    setSelectedEmailIndex,
    splitView,
    onEmailSelect: handleEmailSelect,
    emailListRef,
    emailDetailRef,
  });

  const getBasePath = useCallback(() => {
    return isFocusedMode ? '/focused-inbox' : '/inbox';
  }, [isFocusedMode]);

  const setMode = useCallback((newMode: InboxMode) => {
    setModeState(newMode);
    // Reset category order when mode changes so it gets recalculated for the new mode
    setStableCategoryOrder([]);
    // Reset auto-expand flag so the top category gets auto-expanded in the new mode
    hasAutoExpandedRef.current = false;
  }, []);

  // Toggle category expansion
  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Update stable category order when priority-based order changes
  const updateStableCategoryOrder = useCallback((categories: string[]) => {
    if (categories.length > 0) {
      setStableCategoryOrder(categories);

      // Auto-expand the top priority category on initial load
      if (!hasAutoExpandedRef.current && categories.length > 0) {
        hasAutoExpandedRef.current = true;
        setExpandedCategories(new Set([categories[0]]));
      }
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      
      if (urlThreadId && splitView.selectedEmailId !== urlThreadId) {
        splitView.openEmail(urlThreadId);
      }
      
      if (!urlMode) {
        const basePath = getBasePath();
        navigate(`${basePath}/${mode}`, { replace: true });
      }
      return;
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) return;

    const basePath = getBasePath();
    let newPath: string;
    
    if (splitView.selectedEmailId) {
      newPath = `${basePath}/${mode}/${splitView.selectedEmailId}`;
    } else {
      newPath = `${basePath}/${mode}`;
    }

    if (newPath !== lastUrlRef.current) {
      lastUrlRef.current = newPath;
      navigate(newPath, { replace: true });
    }
  }, [mode, splitView.selectedEmailId, navigate, getBasePath]);

  useEffect(() => {
    if (isInitialMount.current) return;

    if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
      setModeState(urlMode);
    }

    if (urlThreadId && urlThreadId !== splitView.selectedEmailId) {
      splitView.openEmail(urlThreadId);
    } else if (!urlThreadId && splitView.selectedEmailId) {
      splitView.closeEmail();
    }
  }, [urlMode, urlThreadId]);

  return {
    // State
    mode,
    setMode,
    isFocusedMode,
    user,
    logout,
    refreshUser,
    authLoading,
    navigate,
    t,
    // Email data
    emails,
    setEmails,
    loading,
    decrypting,
    loadingModeSwitch,
    fetchError,
    fetchEmails,
    loadMore,
    hasMore,
    // Selection
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    // Triage
    triageSuggestions,
    // Follow-ups
    followUpDataMap,
    isGeneratingDrafts,
    followUpsError,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    // Hooks
    snoozeInput,
    onboarding,
    urgentNotification,
    debugPanel,
    modals,
    priorityTooltip,
    keyboardHint,
    splitView,
    emailActions,
    keyboardShortcuts,
    inboxFilters,
    // Initialization
    hasInitiallyLoaded,
    hasRunAnalysis,
    nextDelivery,
    lastUrgentCheck,
    updateLastUrgentCheck,
    tabCounts,
    fetchTabCounts,
    // Refs
    triageTabRef,
    actionTabRef,
    followUpTabRef,
    deliverBtnRef,
    emailListRef,
    emailDetailRef,
    // Handlers
    handleEmailClick,
    handleEmailSelect,
    // Tour
    tourSteps,
    // Category accordion state
    expandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
  };
}

