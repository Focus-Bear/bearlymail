/**
 * InboxProvider — wraps Inbox and FocusedInbox with the 4 InboxContext sub-contexts.
 *
 * All existing useInboxState logic lives in the underlying hook. This provider
 * fans its return values out into 4 sub-contexts so consumers can subscribe
 * to only the slice they care about.
 *
 * Ordering of providers (inner → outer): InboxFiltersContext wraps everything
 * so that data/actions/ui can all read filter state if needed via context.
 * The actual nesting here is: Filters > Data > Actions > UI > children.
 *
 * Issue #1225 (Critical Issue #1)
 */

import React, { useMemo } from 'react';

import { useInboxFilters } from 'hooks/useInboxFilters';
import { useInboxState } from 'hooks/useInboxState';

import {
  InboxActionsContext,
  InboxActionsValue,
  InboxDataContext,
  InboxDataValue,
  InboxFiltersContext,
  InboxFiltersValue,
  InboxUIContext,
  InboxUIValue,
} from './InboxContext';

interface InboxProviderProps {
  children: React.ReactNode;
  isFocusedMode?: boolean;
}

export function InboxProvider({ children, isFocusedMode = false }: InboxProviderProps) {
  // filterState must be instantiated first so we can pass it to useInboxState
  // as the single source of truth (fixes #1186 — dual useInboxFilters instantiation).
  const filterState = useInboxFilters();
  const inboxState = useInboxState({ isFocusedMode, inboxFilters: filterState });

  // ── InboxFiltersContext ──────────────────────────────────────────────────
  const filtersValue: InboxFiltersValue = useMemo(
    () => ({
      mode: inboxState.mode,
      inboxFilters: filterState,
    }),
    [inboxState.mode, filterState]
  );

  // ── InboxDataContext ─────────────────────────────────────────────────────
  const dataValue: InboxDataValue = useMemo(
    () => ({
      emails: inboxState.emails,
      setEmails: inboxState.setEmails,
      loading: inboxState.loading,
      decrypting: inboxState.decrypting,
      loadingModeSwitch: inboxState.loadingModeSwitch,
      fetchError: inboxState.fetchError,
      hasInitiallyLoaded: inboxState.hasInitiallyLoaded,
      hasRunAnalysis: inboxState.hasRunAnalysis,
      categorySummary: inboxState.categorySummary ?? null,
      loadedCategoryNames: inboxState.loadedCategoryNames,
      loadingCategoryNames: inboxState.loadingCategoryNames,
      triageSuggestions: inboxState.triageSuggestions,
      followUpDataMap: inboxState.followUpDataMap,
      isGeneratingDrafts: inboxState.isGeneratingDrafts,
      followUpsError: inboxState.followUpsError,
      tabCounts: inboxState.tabCounts,
      nextDelivery: inboxState.nextDelivery,
      lastUrgentCheck: inboxState.lastUrgentCheck,
      selectedEmailIndex: inboxState.selectedEmailIndex,
      selectedEmailIds: inboxState.selectedEmailIds,
      actionTabPulsing: inboxState.actionTabPulsing,
      expandedCategories: inboxState.expandedCategories,
      stableCategoryOrder: inboxState.stableCategoryOrder,
      user: inboxState.user,
      authLoading: inboxState.authLoading,
      isFocusedMode: inboxState.isFocusedMode,
    }),
    [
      inboxState.emails,
      inboxState.setEmails,
      inboxState.loading,
      inboxState.decrypting,
      inboxState.loadingModeSwitch,
      inboxState.fetchError,
      inboxState.hasInitiallyLoaded,
      inboxState.hasRunAnalysis,
      inboxState.categorySummary,
      inboxState.loadedCategoryNames,
      inboxState.loadingCategoryNames,
      inboxState.triageSuggestions,
      inboxState.followUpDataMap,
      inboxState.isGeneratingDrafts,
      inboxState.followUpsError,
      inboxState.tabCounts,
      inboxState.nextDelivery,
      inboxState.lastUrgentCheck,
      inboxState.selectedEmailIndex,
      inboxState.selectedEmailIds,
      inboxState.actionTabPulsing,
      inboxState.expandedCategories,
      inboxState.stableCategoryOrder,
      inboxState.user,
      inboxState.authLoading,
      inboxState.isFocusedMode,
    ]
  );

  // ── InboxActionsContext ──────────────────────────────────────────────────
  const actionsValue: InboxActionsValue = useMemo(
    () => ({
      emailActions: inboxState.emailActions,
      fetchEmails: inboxState.fetchEmails,
      fetchCategoryEmails: inboxState.fetchCategoryEmails,
      handleEmailClick: inboxState.handleEmailClick,
      handleEmailSelect: inboxState.handleEmailSelect,
      generateDrafts: inboxState.generateDrafts,
      updateDraft: inboxState.updateDraft,
      bulkSend: inboxState.bulkSend,
      fetchThreadsWithDrafts: inboxState.fetchThreadsWithDrafts,
      toggleCategory: inboxState.toggleCategory,
      updateStableCategoryOrder: inboxState.updateStableCategoryOrder,
      setSelectedEmailIndex: inboxState.setSelectedEmailIndex,
      setSelectedEmailIds: inboxState.setSelectedEmailIds,
      setActionTabPulsing: inboxState.setActionTabPulsing,
      fetchTabCounts: inboxState.fetchTabCounts,
      updateLastUrgentCheck: inboxState.updateLastUrgentCheck,
      logout: inboxState.logout,
      refreshUser: inboxState.refreshUser,
      setMode: inboxState.setMode,
    }),
    [
      inboxState.emailActions,
      inboxState.fetchEmails,
      inboxState.fetchCategoryEmails,
      inboxState.handleEmailClick,
      inboxState.handleEmailSelect,
      inboxState.generateDrafts,
      inboxState.updateDraft,
      inboxState.bulkSend,
      inboxState.fetchThreadsWithDrafts,
      inboxState.toggleCategory,
      inboxState.updateStableCategoryOrder,
      inboxState.setSelectedEmailIndex,
      inboxState.setSelectedEmailIds,
      inboxState.setActionTabPulsing,
      inboxState.fetchTabCounts,
      inboxState.updateLastUrgentCheck,
      inboxState.logout,
      inboxState.refreshUser,
      inboxState.setMode,
    ]
  );

  // ── InboxUIContext ───────────────────────────────────────────────────────
  const uiValue: InboxUIValue = useMemo(
    () => ({
      splitView: inboxState.splitView,
      modals: inboxState.modals,
      snoozeInput: inboxState.snoozeInput,
      priorityTooltip: inboxState.priorityTooltip,
      keyboardHint: inboxState.keyboardHint,
      debugPanel: inboxState.debugPanel,
      onboarding: inboxState.onboarding,
      urgentNotification: inboxState.urgentNotification,
      keyboardShortcuts: inboxState.keyboardShortcuts,
      tourSteps: inboxState.tourSteps,
      triageTabRef: inboxState.triageTabRef,
      actionTabRef: inboxState.actionTabRef,
      followUpTabRef: inboxState.followUpTabRef,
      deliverBtnRef: inboxState.deliverBtnRef,
      emailListRef: inboxState.emailListRef,
      emailDetailRef: inboxState.emailDetailRef,
    }),
    [
      inboxState.splitView,
      inboxState.modals,
      inboxState.snoozeInput,
      inboxState.priorityTooltip,
      inboxState.keyboardHint,
      inboxState.debugPanel,
      inboxState.onboarding,
      inboxState.urgentNotification,
      inboxState.keyboardShortcuts,
      inboxState.tourSteps,
      inboxState.triageTabRef,
      inboxState.actionTabRef,
      inboxState.followUpTabRef,
      inboxState.deliverBtnRef,
      inboxState.emailListRef,
      inboxState.emailDetailRef,
    ]
  );

  return (
    <InboxFiltersContext.Provider value={filtersValue}>
      <InboxDataContext.Provider value={dataValue}>
        <InboxActionsContext.Provider value={actionsValue}>
          <InboxUIContext.Provider value={uiValue}>{children}</InboxUIContext.Provider>
        </InboxActionsContext.Provider>
      </InboxDataContext.Provider>
    </InboxFiltersContext.Provider>
  );
}
