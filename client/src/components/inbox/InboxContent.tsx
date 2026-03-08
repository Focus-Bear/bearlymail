import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, InboxMode } from 'types/email';

import { BatchInfoBar } from 'components/inbox/BatchInfoBar';
import { CategoryAccordion, CategoryGroup, groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { DebugView } from 'components/inbox/DebugView';
import { EmailListItem } from 'components/inbox/EmailListItem';
import { EmailListStates } from 'components/inbox/EmailListStates';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { ProtoCategorySubAccordion } from 'components/inbox/ProtoCategorySubAccordion';
import { ResizableDivider } from 'components/inbox/ResizableDivider';
import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { API_URL } from 'config/api';
import { INBOX_FETCH_LIMIT } from 'constants/numbers';
import {
  CATEGORY_OTHER,
  MODE_FOLLOW_UP,
  MODE_TRIAGE,
  PARAM_CATEGORIES,
  PARAM_CATEGORY_IDS,
  STRING_NONE,
} from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { useProtoCategoryManagement } from 'hooks/useProtoCategoryManagement';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSplitView } from 'hooks/useSplitView';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';
import { CategorySummaryItem } from 'store/slices/emailSlice';

interface InboxContentProps {
  mode: InboxMode;
  emails: Email[];
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  triageSuggestions: Map<string, any>;
  followUpDataMap: Map<string, any>;
  isGeneratingDrafts: boolean;
  followUpsError: string | null;
  priorityTooltip: any;
  keyboardHint: any;
  snoozeInput: any;
  emailActions: any;
  modals: any;
  splitView: ReturnType<typeof useSplitView>;
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent) => void;
  onGenerateDrafts: () => Promise<void>;
  onRetry: () => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  emailDetailRef: React.RefObject<HTMLDivElement | null>;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  fetchCategoryEmails?: (categoryName: string) => Promise<void>;
  expandedCategories: Set<string>;
  stableCategoryOrder: string[];
  onToggleCategory: (category: string) => void;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  categorySummary?: CategorySummaryItem[] | null;
  loadedCategoryNames?: string[];
  loadingCategoryNames?: string[];
}

// eslint-disable-next-line max-lines-per-function -- Inbox content component requires handling multiple inbox modes, emails, and UI states

type InboxSplitView = {
  isMobile: boolean;
  selectedEmailId: string | null | undefined;
  panelExpanded: boolean;
  isResizing: boolean;
  splitPosition: number;
};

function computeEmailListBorderRight(splitView: InboxSplitView): string {
  if (splitView.selectedEmailId && !splitView.panelExpanded && !splitView.isMobile) {
    return `1px solid ${theme.colors.border.light}`;
  }
  return STRING_NONE;
}

function computeCanRenderCategories(
  loading: boolean,
  isRefetchingWithoutData: boolean,
  hasInitiallyLoaded: boolean,
  loadingModeSwitch: boolean,
  fetchError: string | null | undefined,
  categoriesCount: number
): boolean {
  if (loading || isRefetchingWithoutData || !hasInitiallyLoaded) {
    return false;
  }
  if (loadingModeSwitch || fetchError || categoriesCount === 0) {
    return false;
  }
  return true;
}

function computeIsEmailsEmpty(
  isRefetchingWithoutData: boolean,
  categorySummary: Array<{ name: string; count: number }> | null | undefined,
  loading: boolean,
  loadingModeSwitch: boolean,
  emailsCount: number
): boolean {
  if (isRefetchingWithoutData) {
    return false;
  }
  if (categorySummary !== null && categorySummary !== undefined) {
    return categorySummary.length === 0 && !loading && !loadingModeSwitch;
  }
  return emailsCount === 0 && !loading && !loadingModeSwitch;
}

function computeHasInfiniteSentinel(
  hasMore: boolean,
  loading: boolean,
  loadingModeSwitch: boolean,
  hasInitiallyLoaded: boolean
): boolean {
  return hasMore && !loading && !loadingModeSwitch && hasInitiallyLoaded;
}

export const InboxContent: React.FC<InboxContentProps> = ({
  mode,
  emails,
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  selectedEmailIndex,
  selectedEmailIds,
  triageSuggestions,
  followUpDataMap,
  isGeneratingDrafts,
  followUpsError,
  priorityTooltip,
  keyboardHint,
  snoozeInput,
  emailActions,
  modals,
  splitView,
  nextDelivery,
  lastUrgentCheck,
  onEmailClick,
  onEmailSelect,
  onGenerateDrafts,
  onRetry,
  updateDraft,
  bulkSend,
  fetchThreadsWithDrafts,
  emailListRef,
  emailDetailRef,
  onSplitViewArchive,
  onSplitViewSnooze,
  onSplitViewPrioritySet,
  onBulkArchive,
  expandedCategories,
  stableCategoryOrder,
  onToggleCategory,
  onUpdateStableCategoryOrder,
  onLoadMore,
  hasMore,
  categorySummary,
  loadedCategoryNames,
}) => {
  const { isMobile } = useResponsiveBreakpoints();
  const summaryLoading = useSelector(selectSummaryLoading);
  // True when we're fetching a fresh summary and have no cached category data yet.
  // In this state we show a loading indicator and suppress the empty-state to avoid
  // a false "No emails" flash while data is being fetched.
  const isRefetchingWithoutData = summaryLoading && (categorySummary === null || categorySummary === undefined);
  const splitViewContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const {
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    fetchProtoCategories,
    handleReanalyseOther,
    handleConvertProtoCategory,
    handleDeleteProtoCategoryFromInbox,
  } = useProtoCategoryManagement();

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || isLoadingMoreRef.current || !hasMore) {
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      await onLoadMore();
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [onLoadMore, hasMore]);

  // Infinite scroll: trigger loadMore when the sentinel element enters the viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  const filteredEmails = useMemo(() => emails.filter(email => !email.isArchived), [emails]);

  // Build per-category email map from the loaded flat email array.
  // Primary path: emails have already been keyed by normalizeCategoryEmails in
  // useEmailFetching, so email.category == UUID key → direct map lookup works.
  // Defensive path: when categorySummary is available we re-key any entries that
  // still use the human-readable name so lookups by UUID never return undefined.
  const emailCategoryMap = useMemo(() => {
    const map = new Map<string, CategoryGroup>();
    groupEmailsByCategory(filteredEmails, mode).forEach(group => {
      map.set(group.category, group);
    });

    // Re-key by UUID when category summary provides IDs.
    // Guards against emails that arrived before normalizeCategoryEmails ran (e.g.
    // initial eager-load or a fetch path that bypasses the normalizer).
    if (categorySummary) {
      const nameToKey = new Map(categorySummary.map(cat => [cat.name, getCategoryKey(cat.id, cat.name)]));
      const rekeyed = new Map<string, CategoryGroup>();
      map.forEach((value, key) => {
        const uuidKey = nameToKey.get(key);
        rekeyed.set(uuidKey ?? key, { ...value, category: uuidKey ?? key });
      });
      return rekeyed;
    }
    return map;
  }, [filteredEmails, mode, categorySummary]);

  /**
   * Look up a category group by its category key (UUID or name).
   * Direct map lookup — no fuzzy matching needed since both keys and email.category
   * are normalised to the same UUID-or-name format by normalizeCategoryEmails.
   */
  const getCategoryGroup = (categoryKey: string): CategoryGroup | undefined => emailCategoryMap.get(categoryKey);

  // Group "Other" category emails by their proto category name for sub-accordions
  const otherProtoGroups = useMemo(() => {
    const otherEmails = emailCategoryMap.get(CATEGORY_OTHER)?.emails ?? [];
    const groups = new Map<string, typeof otherEmails>();
    otherEmails.forEach(email => {
      const protoName = email.protoCategoryName;
      if (protoName) {
        if (!groups.has(protoName)) {
          groups.set(protoName, []);
        }
        groups.get(protoName)!.push(email);
      }
    });
    return Array.from(groups.entries()).map(([name, groupEmails]) => ({ name, emails: groupEmails }));
  }, [emailCategoryMap]);

  // When a summary is available, use it as the authoritative category order.
  // Fall back to grouping loaded emails when no summary is available.
  const summaryCategories = categorySummary !== undefined ? categorySummary : null;

  // Update stable category order from summary (preferred) or from loaded emails (fallback).
  // Stores category *keys* (UUID when available, name otherwise) so that the order array
  // is stable even if category names change after consolidation.
  useEffect(() => {
    if (summaryCategories && summaryCategories.length > 0) {
      const summaryKeys = summaryCategories.map(cat => getCategoryKey(cat.id, cat.name));
      if (stableCategoryOrder.length === 0) {
        console.log('[InboxContent] Initialising stableCategoryOrder from summary (keys):', summaryKeys);
        onUpdateStableCategoryOrder(summaryKeys);
      } else {
        const newKeys = summaryKeys.filter(key => !stableCategoryOrder.includes(key));
        if (newKeys.length > 0) {
          console.log('[InboxContent] Appending new category keys from summary:', newKeys);
          onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys]);
        }
      }
    } else if (!summaryCategories) {
      // Fallback: derive order from loaded emails (legacy path — no summary available)
      const categoryGroups = groupEmailsByCategory(filteredEmails, mode);
      if (categoryGroups.length > 0) {
        if (stableCategoryOrder.length === 0) {
          console.log(
            '[InboxContent] Initialising stableCategoryOrder from emails (no summary):',
            categoryGroups.map(grp => grp.category)
          );
          onUpdateStableCategoryOrder(categoryGroups.map(grp => grp.category));
        } else {
          const newKeys = categoryGroups
            .filter(grp => !stableCategoryOrder.includes(grp.category))
            .map(grp => grp.category);
          if (newKeys.length > 0) {
            console.log('[InboxContent] Appending new category keys from emails (no summary):', newKeys);
            onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys]);
          }
        }
      }
    }
  }, [summaryCategories, filteredEmails, stableCategoryOrder, onUpdateStableCategoryOrder, mode]);

  // Build the ordered list of categories to render.
  // Each item carries both its display `name` and its stable `id` (UUID or null).
  // When a summary exists: show ALL categories (even those without loaded emails yet).
  // Order follows stableCategoryOrder (which stores keys), with new categories appended.
  // Empty categories (count=0) are excluded so they disappear after archiving all emails.
  const displayCategories = useMemo((): Array<{ id: string | null; name: string; count: number }> => {
    const source: Array<{ id: string | null; name: string; count: number }> =
      summaryCategories ??
      groupEmailsByCategory(filteredEmails, mode).map(grp => ({
        id: null,
        name: grp.category,
        count: grp.emails.length,
      }));

    // Filter out categories with count=0 from the source.
    const nonEmptySource = source.filter(cat => cat.count > 0);

    if (stableCategoryOrder.length === 0) {
      return nonEmptySource;
    }

    // stableCategoryOrder stores category keys (UUID or name); match by key
    const orderMap = new Map(stableCategoryOrder.map((key, idx) => [key, idx]));
    return nonEmptySource.slice().sort((itemA, itemB) => {
      const keyA = getCategoryKey(itemA.id, itemA.name);
      const keyB = getCategoryKey(itemB.id, itemB.name);
      const orderA = orderMap.get(keyA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(keyB) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [summaryCategories, filteredEmails, stableCategoryOrder, mode]);

  // Fetch proto categories when "Other" category is visible and expanded.
  // "Other" has no UUID so its key is always the literal name string CATEGORY_OTHER.
  useEffect(() => {
    const hasOther = displayCategories.some(cat => cat.name === CATEGORY_OTHER);
    if (hasOther && expandedCategories.has(CATEGORY_OTHER)) {
      fetchProtoCategories();
    }
  }, [expandedCategories, displayCategories, fetchProtoCategories]);

  const selectedEmailForPanel = useMemo(
    () => (splitView.selectedEmailId ? emails.find(event => event.id === splitView.selectedEmailId) : undefined),
    [emails, splitView.selectedEmailId]
  );

  const handleSplitViewArchive = useCallback(
    (emailId: string) => {
      if (onSplitViewArchive && emailId) {
        onSplitViewArchive(emailId);
      }
    },
    [onSplitViewArchive]
  );

  const handleSplitViewSnooze = useCallback(
    (emailId: string) => {
      if (onSplitViewSnooze && emailId) {
        onSplitViewSnooze(emailId);
      }
    },
    [onSplitViewSnooze]
  );

  const handleSplitViewPrioritySet = useCallback(
    (emailId: string, starCount: number) => {
      if (onSplitViewPrioritySet && emailId) {
        onSplitViewPrioritySet(emailId, starCount);
      }
    },
    [onSplitViewPrioritySet]
  );

  const handleSendFollowUp = async (followUpId: string, draft: string, recipientName?: string) => {
    try {
      const response = await axios.post(`${API_URL}/follow-ups/${followUpId}/review-draft`, { draft, recipientName });
      const reviewedDraft = response.data;

      if (reviewedDraft !== draft && updateDraft) {
        await updateDraft(followUpId, reviewedDraft);
      }

      if (bulkSend) {
        await bulkSend([followUpId]);
      }
      fetchThreadsWithDrafts();
    } catch (error) {
      console.error('Error reviewing or sending follow-up:', error);
      if (bulkSend) {
        await bulkSend([followUpId]);
      }
      fetchThreadsWithDrafts();
    }
  };

  return (
    <div
      ref={splitViewContainerRef}
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Email List */}
      <div
        ref={emailListRef}
        tabIndex={0}
        style={{
          flex: (() => {
            if (splitView.panelExpanded && splitView.selectedEmailId) {
              return 0;
            }
            if (splitView.selectedEmailId) {
              return `0 0 ${splitView.splitPosition}%`;
            }
            return 1;
          })(),
          overflowY: 'auto',
          padding: isMobile
            ? `${theme.spacing.sm} ${theme.spacing.xs}`
            : `${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg}`,
          transition: splitView.isResizing ? 'none' : 'flex 0.3s ease',
          borderRight: computeEmailListBorderRight(splitView),
        }}
      >
        <div
          style={{
            maxWidth: splitView.selectedEmailId ? '100%' : '1000px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? theme.spacing.xs : theme.spacing.md,
          }}
        >
          {mode === MODE_TRIAGE && <BatchInfoBar nextDelivery={nextDelivery} lastUrgentCheck={lastUrgentCheck} />}
          {mode === MODE_FOLLOW_UP && (
            <FollowUpActions
              onGenerateDrafts={onGenerateDrafts}
              isGenerating={isGeneratingDrafts}
              error={followUpsError}
              onRetry={onRetry}
            />
          )}
          <EmailListStates
            loading={loading || isRefetchingWithoutData}
            hasInitiallyLoaded={hasInitiallyLoaded}
            loadingModeSwitch={loadingModeSwitch}
            decrypting={decrypting}
            fetchError={fetchError}
            emailsEmpty={computeIsEmailsEmpty(
              isRefetchingWithoutData,
              categorySummary,
              loading,
              loadingModeSwitch,
              emails.length
            )}
            mode={mode}
            onRetry={onRetry}
          />
          {computeCanRenderCategories(
            loading,
            isRefetchingWithoutData,
            hasInitiallyLoaded,
            loadingModeSwitch,
            fetchError,
            displayCategories.length
          ) &&
            displayCategories.map((categoryItem, catIdx) => {
              const categoryName = categoryItem.name;
              // categoryKey is the UUID when available, name otherwise — used for all
              // internal lookups (emailCategoryMap, expandedCategories, loadedCategoryNames)
              const categoryKey = getCategoryKey(categoryItem.id, categoryName);
              const isExpanded = expandedCategories.has(categoryKey);
              const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
              const group = getCategoryGroup(categoryKey);
              const categoryEmails = group?.emails ?? [];

              // Hide categories that have been fully loaded AND have no emails AND the summary
              // also reports zero count. Checking all three prevents the accordion from
              // vanishing when the fetch returns 0 emails due to a race/backend issue while
              // the summary still shows a non-zero count — that would be a false disappearance.
              if (isLoaded && categoryEmails.length === 0 && categoryItem.count === 0) {
                console.debug(
                  '[InboxContent] Hiding empty category (isLoaded=true, 0 emails, count=0):',
                  categoryName,
                  '(key:',
                  categoryKey,
                  ')'
                );
                return null;
              }

              // Warn when the fetch completed but no emails matched the category key.
              if (isLoaded && categoryEmails.length === 0 && categoryItem.count > 0) {
                console.warn('[InboxContent] Category loaded but shows 0 emails despite summary count > 0:', {
                  categoryName,
                  categoryKey,
                  summaryCount: categoryItem.count,
                  mapKeys: Array.from(emailCategoryMap.keys()),
                });
              }

              // Compute global index for keyboard navigation (across categories)
              let globalIndex = 0;
              for (let i = 0; i < catIdx; i++) {
                const prevKey = getCategoryKey(displayCategories[i].id, displayCategories[i].name);
                const prevGroup = getCategoryGroup(prevKey);
                globalIndex += prevGroup?.emails.length ?? 0;
              }

              const renderEmailItem = (email: Email, emailIndex: number) => {
                const suggestion = mode === MODE_TRIAGE ? triageSuggestions.get(email.id) || null : null;
                const isSelected = selectedEmailIds.has(email.id) || selectedEmailIndex === emailIndex;
                const followUpData = mode === MODE_FOLLOW_UP ? followUpDataMap.get(email.threadId) : null;
                return (
                  <EmailListItem
                    key={email.id}
                    email={email}
                    index={emailIndex}
                    mode={mode}
                    isSelected={isSelected}
                    suggestion={suggestion}
                    priorityTooltip={priorityTooltip}
                    keyboardHint={keyboardHint}
                    snoozeInput={snoozeInput}
                    onEmailClick={onEmailClick}
                    onEmailSelect={onEmailSelect}
                    onSetStarCount={emailActions.handleSetStarCount}
                    onArchive={emailActions.handleArchive}
                    onBlockSender={emailActions.handleBlockSender}
                    onSnooze={emailActions.handleSnooze}
                    onOverrideUrgency={() => {
                      if (email.emailThreadId && email.urgencyScore !== undefined) {
                        modals.showUrgencyOverride(email.emailThreadId, email.urgencyScore);
                      }
                    }}
                    onProvideFeedback={() => {
                      priorityTooltip.hidePriorityTooltip();
                      modals.showPriorityFeedback(email.id, getEmailPriorityScore(email));
                    }}
                    followUpData={followUpData}
                    onUpdateDraft={updateDraft}
                    onSendFollowUp={(followUpId: string, draft: string) =>
                      handleSendFollowUp(followUpId, draft, (email as any).otherPersonName)
                    }
                    recipientName={(email as any).otherPersonName}
                  />
                );
              };

              const isOtherCategory = categoryName === CATEGORY_OTHER;
              const hasProtoGroups = isOtherCategory && otherProtoGroups.length > 0;

              // For "Other" category with proto groups, compute uncategorized emails
              const protoGroupedEmailIds = hasProtoGroups
                ? new Set(otherProtoGroups.flatMap(group => group.emails.map(event => event.id)))
                : new Set<string>();
              const uncategorizedOtherEmails = hasProtoGroups
                ? categoryEmails.filter(event => !protoGroupedEmailIds.has(event.id))
                : [];

              return (
                <CategoryAccordion
                  key={categoryKey}
                  category={categoryName}
                  emails={categoryEmails}
                  // Use actual email count when loaded (summary count can be stale after archives)
                  count={isLoaded ? categoryEmails.length : categoryItem.count}
                  isLoadingContent={isExpanded && !isLoaded}
                  isExpanded={isExpanded}
                  onToggle={() => onToggleCategory(categoryKey)}
                  onArchiveAll={async (catName: string, ids: string[]) => {
                    if (!onBulkArchive) {
                      return;
                    }
                    if (ids && ids.length > 0) {
                      await onBulkArchive(ids);
                      return;
                    }

                    try {
                      const params = new URLSearchParams();
                      params.append('mode', mode);
                      // Use UUID when available to avoid name encoding issues
                      if (categoryItem.id) {
                        params.append(PARAM_CATEGORY_IDS, categoryItem.id);
                      } else {
                        params.append(PARAM_CATEGORIES, catName);
                      }
                      params.append('limit', INBOX_FETCH_LIMIT.toString());
                      params.append('offset', '0');

                      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
                      const fetchedEmails = response.data?.emails || [];
                      const fetchedIds = fetchedEmails.map((event: any) => event.id).filter(Boolean);
                      if (fetchedIds.length > 0) {
                        await onBulkArchive(fetchedIds);
                      }
                    } catch (err) {
                      console.error('[InboxContent] Failed to load category emails for archive:', err);
                    }
                  }}
                  onReanalyseOther={handleReanalyseOther}
                  isReanalysingOther={isReanalysingOther}
                >
                  {hasProtoGroups
                    ? (() => {
                        let offset = 0;
                        return (
                          <>
                            {otherProtoGroups.map(group => {
                              const groupStart = offset;
                              offset += group.emails.length;
                              const protoCategory = protoCategories.find(pc => pc.name === group.name);
                              return (
                                <ProtoCategorySubAccordion
                                  key={group.name}
                                  name={group.name}
                                  description={protoCategory?.description}
                                  emailCount={group.emails.length}
                                  onConvertToCategory={() =>
                                    handleConvertProtoCategory(protoCategory?.id ?? '', group.name)
                                  }
                                  isConverting={
                                    convertingProtoCategoryId === protoCategory?.id && protoCategory !== undefined
                                  }
                                  onArchiveAll={onBulkArchive}
                                  emailIds={group.emails.map(email => email.id)}
                                  onDelete={
                                    protoCategory
                                      ? () => handleDeleteProtoCategoryFromInbox(protoCategory.id)
                                      : undefined
                                  }
                                  isDeleting={
                                    deletingProtoCategoryId === protoCategory?.id && protoCategory !== undefined
                                  }
                                >
                                  {group.emails.map((email, i) => renderEmailItem(email, globalIndex + groupStart + i))}
                                </ProtoCategorySubAccordion>
                              );
                            })}
                            {uncategorizedOtherEmails.map((email, i) =>
                              renderEmailItem(email, globalIndex + offset + i)
                            )}
                          </>
                        );
                      })()
                    : categoryEmails.map((email, indexInCategory) =>
                        renderEmailItem(email, globalIndex + indexInCategory)
                      )}
                </CategoryAccordion>
              );
            })}
          {/* Sentinel element for infinite scroll — triggers loadMore via IntersectionObserver */}
          {computeHasInfiniteSentinel(hasMore, loading, loadingModeSwitch, hasInitiallyLoaded) && (
            <div ref={sentinelRef} style={{ height: '1px', visibility: 'hidden' }} aria-hidden="true" />
          )}
          <DebugView emails={emails} />
        </div>
      </div>

      {/* Resizable Divider */}
      {!splitView.isMobile && splitView.selectedEmailId && !splitView.panelExpanded && (
        <ResizableDivider
          onResize={splitView.setSplitPosition}
          onResizeStart={splitView.startResize}
          onResizeEnd={splitView.endResize}
          position={splitView.splitPosition}
          containerRef={splitViewContainerRef}
        />
      )}

      {/* Email Detail Panel */}
      {!splitView.isMobile && splitView.selectedEmailId && (
        <SplitViewPanel
          selectedEmailId={splitView.selectedEmailId}
          selectedEmail={selectedEmailForPanel}
          panelExpanded={splitView.panelExpanded}
          splitPosition={splitView.splitPosition}
          isResizing={splitView.isResizing}
          emailDetailRef={emailDetailRef}
          onTogglePanel={splitView.togglePanel}
          onClose={splitView.closeEmail}
          onArchiveComplete={handleSplitViewArchive}
          onSnoozeComplete={handleSplitViewSnooze}
          onPrioritySet={handleSplitViewPrioritySet}
          mode={mode}
        />
      )}
    </div>
  );
};
