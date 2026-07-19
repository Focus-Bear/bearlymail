import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { InboxMode } from 'types/email';

import {
  MODE_ACTION,
  MODE_AUTORESPONDED,
  MODE_BLOCKED,
  MODE_FOLLOW_UP,
  MODE_SCHEDULED,
  MODE_TRIAGE,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useBatchSchedule } from 'hooks/useBatchSchedule';
import { useCategoryArchiveAllHotkey } from 'hooks/useCategoryArchiveAllHotkey';
import { useCategoryFetch } from 'hooks/useCategoryFetch';
import { useEmailActions } from 'hooks/useEmailActions';
import { useEmailManagement } from 'hooks/useEmailManagement';
import { useEmailSelection } from 'hooks/useEmailSelection';
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
import { clearCategoryState, setSummaryLoading } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

const VALID_MODES: InboxMode[] = [
  MODE_TRIAGE,
  MODE_ACTION,
  MODE_FOLLOW_UP,
  MODE_BLOCKED,
  MODE_AUTORESPONDED,
  MODE_SCHEDULED,
];

function isValidMode(mode: string | undefined): mode is InboxMode {
  return mode !== undefined && VALID_MODES.includes(mode as InboxMode);
}

interface UseInboxStateOptions {
  isFocusedMode?: boolean;
  /**
   * External filterState instance to use as the single source of truth.
   * Pass this from the call-site (e.g. Inbox.tsx) so that the filter UI and
   * fetchEmails both reference the same React state object.
   *
   * When omitted (e.g. FocusedInbox.tsx), useInboxState creates its own
   * internal instance — the hook call below is always executed to satisfy
   * React's rules-of-hooks (no conditional hook calls).
   */
  inboxFilters?: ReturnType<typeof useInboxFilters>;
}

// eslint-disable-next-line max-statements -- pre-existing: complex hook managing inbox state transitions
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

  // basePath for constructing navigate targets — must be defined early so it can be used
  // in setMode, openEmailWithNavigate, and closeEmailWithNavigate below.
  const basePath = isFocusedMode ? '/focused-inbox' : '/inbox';

  // Triage suggestions hook
  const { triageSuggestions, loadingSuggestions, fetchTriageSuggestions, removeSuggestion, clearSuggestionsCache } =
    useTriageSuggestions();

  // Tab counts hook - must be before useEmailManagement since it's passed to it
  const { tabCounts, fetchTabCounts, updateTabCountsOptimistically } = useTabCounts();

  // Inbox filters hook — always call to satisfy rules-of-hooks, but use the
  // caller-supplied instance when provided so the filter UI and fetchEmails
  // share one source of truth (fixes #1186).
  const _internalInboxFilters = useInboxFilters();
  const inboxFilters = options.inboxFilters ?? _internalInboxFilters;

  // Action tab pulse state — set true when email moves to signal where it went
  const [actionTabPulsing, setActionTabPulsing] = useState(false);
  const actionTabPulseRafRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (actionTabPulseRafRef.current !== null) {
        cancelAnimationFrame(actionTabPulseRafRef.current);
      }
    };
  }, []);
  const onEmailMovedInTriage = useCallback(() => {
    // Pulse the Action tab to show where the email went (mobile + desktop)
    // Force a class removal/re-add cycle via requestAnimationFrame so rapid
    // prioritisations each re-trigger the animation even if it's already running.
    setActionTabPulsing(false);
    if (actionTabPulseRafRef.current !== null) {
      cancelAnimationFrame(actionTabPulseRafRef.current);
    }
    actionTabPulseRafRef.current = requestAnimationFrame(() => {
      setActionTabPulsing(true);
      actionTabPulseRafRef.current = null;
    });
  }, []);

  // Email management hook
  const emailManagement = useEmailManagement({
    mode,
    onSuggestionRemove: removeSuggestion,
    onTabCountsUpdateOptimistically: updateTabCountsOptimistically,
    onEmailMoved: mode === MODE_TRIAGE ? onEmailMovedInTriage : undefined,
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
    fetchCategoryEmails,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
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

  // Navigate-aware wrappers for openEmail / closeEmail.
  // Effect 2 in useInboxUrlSync has been DELETED (fix for #1191 navigate loop).
  // Navigation is now explicit in these event-handler wrappers rather than driven by a
  // reactive effect. This breaks the state→navigate→URL→state cycle that caused
  // Chrome to throttle navigation at 1000+ calls per load.
  //
  // These wrappers are passed everywhere splitView.openEmail/closeEmail were used so that
  // ALL call sites (email click, keyboard navigation, email actions, URL sync) produce a
  // navigate() call as part of the user-action, not as a downstream effect.
  const openEmailWithNavigate = useCallback(
    (emailId: string) => {
      splitView.openEmail(emailId);
      navigate(`${basePath}/${mode}/${emailId}`, { replace: true });
    },
    [splitView, navigate, basePath, mode]
  );

  const closeEmailWithNavigate = useCallback(() => {
    splitView.closeEmail();
    navigate(`${basePath}/${mode}`, { replace: true });
  }, [splitView, navigate, basePath, mode]);

  // Build a splitView proxy that replaces openEmail/closeEmail with navigate-aware versions.
  // Passed to useEmailActions, useInboxEmailHandlers, and all other consumers so they
  // automatically navigate when opening/closing emails.
  const splitViewWithNavigate = {
    ...splitView,
    openEmail: openEmailWithNavigate,
    closeEmail: closeEmailWithNavigate,
  };

  // Initialization hook
  const { hasInitiallyLoaded, hasRunAnalysis } = useInboxInitialization({
    authLoading,
    user,
    mode,
    fetchEmails,
    fetchBatchStatus,
    fetchTabCounts,
    filters: inboxFilters.filters,
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
    filters: inboxFilters.filters,
    setEmails,
    setLoadingModeSwitch,
    clearSuggestionsCache,
    fetchTriageSuggestions,
    emails,
    loadingSuggestions,
  });

  // Re-fetch tab counts when any filter dimension changes so badge counts reflect the active filter
  const prevFiltersRef = useRef<typeof inboxFilters.filters | undefined>(undefined);
  useEffect(() => {
    const currentFilters = inboxFilters.filters;
    // Skip the very first render (initialization handles the initial fetch)
    if (prevFiltersRef.current === undefined) {
      prevFiltersRef.current = currentFilters;
      return;
    }
    const prev = prevFiltersRef.current;
    const filtersChanged =
      prev.minPriority !== currentFilters.minPriority ||
      prev.maxPriority !== currentFilters.maxPriority ||
      prev.categories.join(',') !== currentFilters.categories.join(',') ||
      prev.accountIds.join(',') !== currentFilters.accountIds.join(',');
    if (filtersChanged) {
      prevFiltersRef.current = currentFilters;
      fetchTabCounts(true, currentFilters).catch(err =>
        console.error('Error fetching tab counts on filter change:', err)
      );
    }
  }, [inboxFilters.filters, fetchTabCounts]);

  // Stable ref for the batch-delivery callback — updated on every render so the
  // setTimeout always calls with the latest fetchTabCounts + filters values even if
  // the delivery timer was scheduled many minutes earlier.
  // (useEffectEvent does not exist in React 19.2 stable; this is the stable equivalent.)
  const onBatchDeliveryRef = useRef<() => void>(() => {});
  onBatchDeliveryRef.current = () => {
    fetchTabCounts(true, inboxFilters.filters, undefined, true).catch(err => {
      console.error('Error refreshing tab counts after batch delivery:', err);
    });
  };

  // When the next scheduled batch delivery arrives, immediately refresh tab counts so the
  // triage badge reflects the newly-delivered emails without the user having to switch tabs.
  // The 30-second background poll in useTabCounts is a general fallback; this timer fires
  // at the exact delivery moment for zero-delay updates on the primary use case.
  useEffect(() => {
    if (!nextDelivery) {
      return;
    }
    const msUntilDelivery = nextDelivery.getTime() - Date.now();
    if (msUntilDelivery <= 0) {
      onBatchDeliveryRef.current();
      return;
    }
    const timer = setTimeout(() => {
      onBatchDeliveryRef.current();
    }, msUntilDelivery);
    return () => clearTimeout(timer);
  }, [nextDelivery]); // onBatchDeliveryRef is a stable ref object — always current

  // Which category drawers are expanded, mirrored into a ref: useCategoryFetch
  // runs after this point in the hook order, so the actions hook reads the live
  // value through the ref instead of a (stale) captured Set.
  const expandedCategoriesRef = useRef<Set<string> | undefined>(undefined);

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
    expandedCategoriesRef,
    selectedEmailIndex,
    setSelectedEmailIndex,
    splitView: splitViewWithNavigate,
    onTabCountsUpdateOptimistically: updateTabCountsOptimistically,
  });

  // Persist the current inbox mode and base path to sessionStorage so that back navigation
  // survives page refreshes and direct-URL access (see EmailDetailSidebar, getInboxPath).
  useEffect(() => {
    try {
      sessionStorage.setItem('bearlymail_lastInboxMode', mode);
      sessionStorage.setItem('bearlymail_lastBasePath', basePath);
    } catch {
      // sessionStorage unavailable — back navigation falls back to /inbox (no regression)
    }
  }, [mode, basePath]);

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
    splitView: splitViewWithNavigate,
    emailListRef,
    emailDetailRef,
    navigate,
    mode,
    basePath,
  });

  // Category accordion state sub-hook (replaces 2 useCallbacks + 4 refs/assignments + 2 useEffects)
  const {
    expandedCategories,
    stableCategoryOrder,
    activeCategoryKey,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  } = useCategoryFetch({
    categorySummary,
    fetchCategoryEmails,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
  });
  // Mirror into the ref in an effect (not during render) so concurrent
  // renders that get discarded never leave a stale value behind; the ref is
  // only read inside event handlers, which run after effects.
  useEffect(() => {
    expandedCategoriesRef.current = expandedCategories;
  }, [expandedCategories]);

  // Delete archives all in the open category accordion (Y to confirm), unless an email is focused —
  // then the email-level Delete shortcut wins. Ignored while typing in an input.
  useCategoryArchiveAllHotkey({
    activeCategoryKey,
    emailKeyboardActive:
      selectedEmailIndex >= 0 || selectedEmailIds.size > 0 || Boolean(splitView.selectedEmailId),
  });

  const setMode = useCallback(
    (newMode: InboxMode) => {
      setModeState(newMode);
      // Navigate explicitly here instead of relying on a reactive effect.
      // Effect 2 in useInboxUrlSync has been deleted (fix for #1191 navigate loop).
      navigate(`${basePath}/${newMode}`, { replace: true });
      dispatch(clearCategoryState());
      dispatch(setSummaryLoading(true));
      resetForModeChange();
    },
    [navigate, basePath, dispatch, resetForModeChange]
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

  // URL synchronization sub-hook (replaces isInitialMount/lastUrlRef refs + getBasePath + 3 useEffects).
  // Effect 3 (URL→state) receives the RAW splitView callbacks (no navigate) because the URL
  // has already changed when Effect 3 fires — calling navigate() again would be redundant
  // and could re-enter the loop. Navigation only needs to happen from user-action handlers
  // (openEmailWithNavigate / closeEmailWithNavigate / setMode).
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
    // Selection
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    // Triage
    triageSuggestions,
    actionTabPulsing,
    setActionTabPulsing,
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
    splitView: splitViewWithNavigate,
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
