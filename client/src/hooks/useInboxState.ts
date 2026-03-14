import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { InboxMode } from 'types/email';

import { MODE_ACTION, MODE_AUTORESPONDED, MODE_BLOCKED, MODE_FOLLOW_UP, MODE_SCHEDULED, MODE_TRIAGE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useBatchSchedule } from 'hooks/useBatchSchedule';
import { useEmailActions } from 'hooks/useEmailActions';
import { useEmailManagement } from 'hooks/useEmailManagement';
import { useEmailSelection } from 'hooks/useEmailSelection';
import { useInboxCategoryAccordion } from 'hooks/useInboxCategoryAccordion';
import { useInboxEmailHandlers } from 'hooks/useInboxEmailHandlers';
import { useInboxFilters } from 'hooks/useInboxFilters';
import { useInboxFollowUpData } from 'hooks/useInboxFollowUpData';
import { useInboxInitialization } from 'hooks/useInboxInitialization';
import { useInboxModeChanges } from 'hooks/useInboxModeChanges';
import { useInboxTourRefs } from 'hooks/useInboxTourRefs';
import { useInboxUIState } from 'hooks/useInboxUIState';
import { useInboxUrlSync } from 'hooks/useInboxUrlSync';
import { useTabCounts } from 'hooks/useTabCounts';
import { useTriageSuggestions } from 'hooks/useTriageSuggestions';
import { clearCategoryState } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

const VALID_MODES: InboxMode[] = [MODE_TRIAGE, MODE_ACTION, MODE_FOLLOW_UP, MODE_BLOCKED, MODE_AUTORESPONDED, MODE_SCHEDULED];

function isValidMode(mode: string | undefined): mode is InboxMode {
  return mode !== undefined && VALID_MODES.includes(mode as InboxMode);
}

interface UseInboxStateOptions {
  isFocusedMode?: boolean;
}

export function useInboxState(options: UseInboxStateOptions = {}) {
  const { isFocusedMode = false } = options;
  const dispatch = useDispatch<AppDispatch>();
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

  // Triage suggestions hook
  const { triageSuggestions, loadingSuggestions, fetchTriageSuggestions, removeSuggestion, clearSuggestionsCache } =
    useTriageSuggestions();

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
    refreshInPlace,
    loadMore,
    fetchCategoryEmails,
    hasMore,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
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

  // Follow-up data (replaces useFollowUps + followUpDataMap useState + 2 useEffects)
  const {
    followUpDataMap,
    followUpsError,
    isGeneratingDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  } = useInboxFollowUpData(mode, user?.id, authLoading);

  // UI peripheral state sub-hook (replaces 8 hooks + GitHub/polling + tracking effect + tourSteps)
  const {
    snoozeInput,
    onboarding,
    urgentNotification,
    debugPanel,
    modals,
    priorityTooltip,
    keyboardHint,
    splitView,
    tourSteps,
  } = useInboxUIState({ user, authLoading, refreshUser, fetchEmails, refreshInPlace, mode, emails, loading });

  // Initialization hook
  const { hasInitiallyLoaded, hasRunAnalysis } = useInboxInitialization({
    authLoading,
    user,
    mode,
    fetchEmails,
    fetchBatchStatus,
    fetchTabCounts,
    refreshInPlace,
  });

  // Tour element refs sub-hook (replaces 6 useRef calls)
  const { triageTabRef, actionTabRef, followUpTabRef, deliverBtnRef, emailListRef, emailDetailRef } =
    useInboxTourRefs();

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

  // Email interaction handlers sub-hook (replaces 3 useCallbacks + useInboxKeyboardNavigation)
  const { keyboardShortcuts, handleEmailClick, handleEmailSelect } = useInboxEmailHandlers({
    emails,
    selectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIndex,
    handleEmailClickBase,
    handleArchiveBase,
    handleSetStarCountBase,
    handleMarkAsRead,
    splitView,
    emailListRef,
    emailDetailRef,
    navigate,
    mode,
  });

  // Category accordion state sub-hook (replaces 2 useCallbacks + 4 refs/assignments + 2 useEffects)
  const { expandedCategories, stableCategoryOrder, toggleCategory, updateStableCategoryOrder, resetForModeChange } =
    useInboxCategoryAccordion({ categorySummary, fetchCategoryEmails, loadedCategoryNames, loadingCategoryNames });

  const setMode = useCallback(
    (newMode: InboxMode) => {
      setModeState(newMode);
      dispatch(clearCategoryState());
      resetForModeChange();
    },
    [dispatch, resetForModeChange]
  );

  // URL-driven mode change (browser back/forward): must also reset accordion state so the
  // new mode auto-expands its own categories. Without this, stale expandedCategories from
  // the previous mode persist, preventing auto-expand of the new mode's categories and
  // causing Effect 1 to attempt fetching categories that don't exist in the new mode.
  const handleUrlModeChange = useCallback(
    (newMode: InboxMode) => {
      setModeState(newMode);
      resetForModeChange();
    },
    [resetForModeChange]
  );

  // URL synchronization sub-hook (replaces isInitialMount/lastUrlRef refs + getBasePath + 3 useEffects)
  useInboxUrlSync({
    isFocusedMode,
    mode,
    splitViewSelectedEmailId: splitView.selectedEmailId,
    urlMode,
    urlThreadId,
    openEmail: splitView.openEmail,
    closeEmail: splitView.closeEmail,
    navigate,
    onUrlModeChange: handleUrlModeChange,
  });

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
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    fetchCategoryEmails,
  };
}
