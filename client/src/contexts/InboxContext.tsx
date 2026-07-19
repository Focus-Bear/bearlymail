/**
 * InboxContext — 4 sub-contexts replacing the ~60-value useInboxState return.
 *
 * Split into 4 sub-contexts so components only re-render when their relevant
 * slice of state changes (data, UI, actions, or filters).
 *
 * Issue #1225 (Critical Issue #1): eliminates god hook + 4-layer prop drilling.
 */

import { createContext, useContext } from 'react';
import { InboxMode } from 'types/email';

import { useInboxFilters } from 'hooks/useInboxFilters';
import { useInboxState } from 'hooks/useInboxState';
import { CategorySummaryItem } from 'store/slices/emailSlice';

// ─────────────────────────────────────────────────────────────────────────────
// Context value types (derived from useInboxState return shape)
// ─────────────────────────────────────────────────────────────────────────────

type InboxStateReturn = ReturnType<typeof useInboxState>;
type InboxFiltersReturn = ReturnType<typeof useInboxFilters>;

/** Core data: emails, categories, loading states */
export interface InboxDataValue {
  emails: InboxStateReturn['emails'];
  setEmails: InboxStateReturn['setEmails'];
  loading: InboxStateReturn['loading'];
  decrypting: InboxStateReturn['decrypting'];
  loadingModeSwitch: InboxStateReturn['loadingModeSwitch'];
  fetchError: InboxStateReturn['fetchError'];
  hasInitiallyLoaded: InboxStateReturn['hasInitiallyLoaded'];
  hasRunAnalysis: InboxStateReturn['hasRunAnalysis'];
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  triageSuggestions: InboxStateReturn['triageSuggestions'];
  followUpDataMap: InboxStateReturn['followUpDataMap'];
  isGeneratingDrafts: InboxStateReturn['isGeneratingDrafts'];
  followUpsError: InboxStateReturn['followUpsError'];
  tabCounts: InboxStateReturn['tabCounts'];
  nextDelivery: InboxStateReturn['nextDelivery'];
  lastUrgentCheck: InboxStateReturn['lastUrgentCheck'];
  selectedEmailIndex: InboxStateReturn['selectedEmailIndex'];
  selectedEmailIds: InboxStateReturn['selectedEmailIds'];
  actionTabPulsing: InboxStateReturn['actionTabPulsing'];
  expandedCategories: InboxStateReturn['expandedCategories'];
  stableCategoryOrder: InboxStateReturn['stableCategoryOrder'];
  user: InboxStateReturn['user'];
  authLoading: InboxStateReturn['authLoading'];
  isFocusedMode: InboxStateReturn['isFocusedMode'];
}

/** UI state: splitView, modals, overlays, tour refs */
export interface InboxUIValue {
  splitView: InboxStateReturn['splitView'];
  modals: InboxStateReturn['modals'];
  snoozeInput: InboxStateReturn['snoozeInput'];
  priorityTooltip: InboxStateReturn['priorityTooltip'];
  keyboardHint: InboxStateReturn['keyboardHint'];
  debugPanel: InboxStateReturn['debugPanel'];
  onboarding: InboxStateReturn['onboarding'];
  urgentNotification: InboxStateReturn['urgentNotification'];
  keyboardShortcuts: InboxStateReturn['keyboardShortcuts'];
  tourSteps: InboxStateReturn['tourSteps'];
  triageTabRef: InboxStateReturn['triageTabRef'];
  actionTabRef: InboxStateReturn['actionTabRef'];
  followUpTabRef: InboxStateReturn['followUpTabRef'];
  deliverBtnRef: InboxStateReturn['deliverBtnRef'];
  emailListRef: InboxStateReturn['emailListRef'];
  emailDetailRef: InboxStateReturn['emailDetailRef'];
}

/** Stable callbacks: email actions, fetch operations, handlers */
export interface InboxActionsValue {
  emailActions: InboxStateReturn['emailActions'];
  fetchEmails: InboxStateReturn['fetchEmails'];
  fetchCategoryEmails: InboxStateReturn['fetchCategoryEmails'];
  handleEmailClick: InboxStateReturn['handleEmailClick'];
  handleEmailSelect: InboxStateReturn['handleEmailSelect'];
  generateDrafts: InboxStateReturn['generateDrafts'];
  updateDraft: InboxStateReturn['updateDraft'];
  bulkSend: InboxStateReturn['bulkSend'];
  fetchThreadsWithDrafts: InboxStateReturn['fetchThreadsWithDrafts'];
  toggleCategory: InboxStateReturn['toggleCategory'];
  updateStableCategoryOrder: InboxStateReturn['updateStableCategoryOrder'];
  setSelectedEmailIndex: InboxStateReturn['setSelectedEmailIndex'];
  setSelectedEmailIds: InboxStateReturn['setSelectedEmailIds'];
  setActionTabPulsing: InboxStateReturn['setActionTabPulsing'];
  fetchTabCounts: InboxStateReturn['fetchTabCounts'];
  updateLastUrgentCheck: InboxStateReturn['updateLastUrgentCheck'];
  logout: InboxStateReturn['logout'];
  refreshUser: InboxStateReturn['refreshUser'];
  setMode: InboxStateReturn['setMode'];
}

/** Filter state: mode, account/category/priority filters */
export interface InboxFiltersValue {
  mode: InboxMode;
  inboxFilters: InboxFiltersReturn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context objects
// ─────────────────────────────────────────────────────────────────────────────

export const InboxDataContext = createContext<InboxDataValue>(null!);
export const InboxUIContext = createContext<InboxUIValue>(null!);
export const InboxActionsContext = createContext<InboxActionsValue>(null!);
export const InboxFiltersContext = createContext<InboxFiltersValue>(null!);

// ─────────────────────────────────────────────────────────────────────────────
// Consumer hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns email data, loading states, category info.
 * Re-renders when data slice changes.
 */
export function useInboxData(): InboxDataValue {
  const ctx = useContext(InboxDataContext);
  if (!ctx) {
    throw new Error('useInboxData must be used inside InboxProvider');
  }
  return ctx;
}

/**
 * Returns UI state: splitView, modals, snooze, refs, tour.
 * Re-renders when UI slice changes.
 */
export function useInboxUI(): InboxUIValue {
  const ctx = useContext(InboxUIContext);
  if (!ctx) {
    throw new Error('useInboxUI must be used inside InboxProvider');
  }
  return ctx;
}

/**
 * Returns stable callbacks: email actions, fetchers, handlers.
 * Re-renders only when actions slice changes (should be rare).
 */
export function useInboxActions(): InboxActionsValue {
  const ctx = useContext(InboxActionsContext);
  if (!ctx) {
    throw new Error('useInboxActions must be used inside InboxProvider');
  }
  return ctx;
}

/**
 * Returns filter state: mode + inboxFilters.
 * Re-renders when filters or mode change.
 */
export function useInboxFiltersCtx(): InboxFiltersValue {
  const ctx = useContext(InboxFiltersContext);
  if (!ctx) {
    throw new Error('useInboxFiltersCtx must be used inside InboxProvider');
  }
  return ctx;
}
