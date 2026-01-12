import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'contexts/AuthContext';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { MODE_FOLLOW_UP } from 'constants/strings';
import { useEmailManagement } from 'hooks/useEmailManagement';
import { useTriageSuggestions } from 'hooks/useTriageSuggestions';
import { useEmailSelection } from 'hooks/useEmailSelection';
import { useBatchSchedule } from 'hooks/useBatchSchedule';
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

// eslint-disable-next-line max-lines-per-function -- Inbox state hook requires managing multiple inbox states, modes, and operations
export function useInboxState() {
  const { t } = useTranslation();
  const { user, logout, refreshUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<InboxMode>('triage');

  // Triage suggestions hook
  const {
    triageSuggestions,
    loadingSuggestions,
    fetchTriageSuggestions,
    removeSuggestion,
    clearSuggestionsCache,
  } = useTriageSuggestions();

  // Email management hook
  const emailManagement = useEmailManagement({ mode, onSuggestionRemove: removeSuggestion });
  const {
    emails,
    setEmails,
    loading,
    decrypting,
    loadingModeSwitch,
    setLoadingModeSwitch,
    fetchError,
    fetchEmails,
    handleSetStarCount: handleSetStarCountBase,
    handleArchive: handleArchiveBase,
    handleSnooze: handleSnoozeBase,
    handleMarkAsRead,
  } = emailManagement;

  // Batch schedule hook
  const { nextDelivery, fetchBatchStatus } = useBatchSchedule();

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
  });

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

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    emails,
    selectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIndex,
    onArchive: handleArchiveBase,
    onSetStarCount: handleSetStarCountBase,
    emailListRef,
    emailDetailRef,
    splitViewSelectedEmailId: splitView.selectedEmailId,
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
      navigate(`/email/${emailId}`);
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

  return {
    // State
    mode,
    setMode,
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
    // Initialization
    hasInitiallyLoaded,
    hasRunAnalysis,
    nextDelivery,
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
  };
}

