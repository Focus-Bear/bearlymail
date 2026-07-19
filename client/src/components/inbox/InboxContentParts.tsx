/**
 * Sub-components extracted from InboxContent to keep individual functions within
 * the max-lines-per-function limit. All components are co-located here because they
 * are only used by InboxContent.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, InboxMode, TriageSuggestion } from 'types/email';
import { devLog, devWarn } from 'utils/dev-logger';
import { ACCORDION_BUDGETS } from 'utils/performanceBudget';

import { BatchInfoBar } from 'components/inbox/BatchInfoBar';
import { CategoryAccordion, CategoryGroup } from 'components/inbox/CategoryAccordion';
import { CategoryDebugPanel } from 'components/inbox/CategoryDebugPanel';
import { DebugView } from 'components/inbox/DebugView';
import { EmailListItem } from 'components/inbox/EmailListItem';
import { EmailListStates } from 'components/inbox/EmailListStates';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { familyGroupingAppliesTo, orderCategoriesByFamily } from 'components/inbox/inboxFamilyGrouping';
import { InboxFamilyHeader } from 'components/inbox/InboxFamilyHeader';
import { ProtoCategorySubAccordion } from 'components/inbox/ProtoCategorySubAccordion';
import { AnalysingPriorityCategory } from 'components/inbox/states/AnalysingPriorityCategory';
import { TriageBatchSummary } from 'components/inbox/TriageBatchSummary';
import { ScheduledEmailsManager } from 'components/scheduled-emails/ScheduledEmailsManager';
import { API_URL } from 'config/api';
import { INBOX_FETCH_LIMIT } from 'constants/numbers';
import { CATEGORY_OTHER, MODE_FOLLOW_UP, MODE_SCHEDULED, MODE_TRIAGE, PARAM_CATEGORY_IDS } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useCategoryFamilyMap } from 'hooks/useCategoryFamilies';
import { useDebugMode } from 'hooks/useDebugMode';
import { useDebugViewOpen } from 'hooks/useDebugViewOpen';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { FollowUpData } from 'hooks/useFollowUps';
import { usePerformanceBudget } from 'hooks/usePerformanceBudget';
import { ProtoCategory } from 'hooks/useProtoCategories';
import { useSyncStatus } from 'hooks/useSyncStatus';
import { selectCategoryBudgetWarning } from 'store/slices/categorySlice';
import { CategorySummaryItem, decrementCategorySummaryCount, markCategoryLoaded } from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';
import { AppDispatch } from 'store/store';

import {
  InboxEmailActions,
  InboxKeyboardHint,
  InboxModals,
  InboxPriorityTooltip,
  InboxSnoozeInput,
} from './inbox.types';
import {
  computeCanRenderCategories,
  computeEmailListBorderRight,
  computeEmailListFlex,
  computeIsEmailsEmpty,
} from './inboxContentParts.helpers';

// ---------------------------------------------------------------------------
// InboxEmailItem
// ---------------------------------------------------------------------------

export interface InboxEmailItemProps {
  email: Email;
  emailIndex: number;
  mode: InboxMode;
  selectedEmailIds: Set<string>;
  selectedEmailIndex: number;
  /** ID of the email currently open in the split-view panel. Takes precedence over
   *  selectedEmailIndex for the highlight check because navigateAfterSplitViewAction
   *  uses a different category ordering than InboxCategoryList (groupEmailsByCategory
   *  vs stableCategoryOrder), which can cause the index-based check to highlight the
   *  wrong email after archive/snooze from the split-view panel. */
  splitViewSelectedEmailId?: string | null;
  triageSuggestions: Map<string, TriageSuggestion>;
  followUpDataMap: Map<string, FollowUpData>;
  priorityTooltip: InboxPriorityTooltip;
  keyboardHint: InboxKeyboardHint;
  snoozeInput: InboxSnoozeInput;
  emailActions: InboxEmailActions;
  modals: InboxModals;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent) => void;
  onSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
  recipientName?: string;
}

export const InboxEmailItem: React.FC<InboxEmailItemProps> = ({
  email,
  emailIndex,
  mode,
  selectedEmailIds,
  selectedEmailIndex,
  splitViewSelectedEmailId,
  triageSuggestions,
  followUpDataMap,
  priorityTooltip,
  keyboardHint,
  snoozeInput,
  emailActions,
  modals,
  updateDraft,
  onEmailClick,
  onEmailSelect,
  onSendFollowUp,
  recipientName,
}) => {
  const suggestion = mode === MODE_TRIAGE ? triageSuggestions.get(email.id) || null : null;
  const isSelected =
    selectedEmailIds.has(email.id) ||
    (splitViewSelectedEmailId != null
      ? email.id === splitViewSelectedEmailId
      : selectedEmailIndex === emailIndex);
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
      onSendFollowUp={(followUpId: string, draft: string) => onSendFollowUp(followUpId, draft, recipientName)}
      recipientName={recipientName}
    />
  );
};

// ---------------------------------------------------------------------------
// InboxOtherCategoryContent — renders proto-group sub-accordions + uncategorized emails
// ---------------------------------------------------------------------------

export interface InboxOtherCategoryContentProps {
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: ProtoCategory[];
  uncategorizedOtherEmails: Email[];
  globalIndex: number;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  renderItem: (email: Email, index: number) => React.ReactNode;
}

export const InboxOtherCategoryContent: React.FC<InboxOtherCategoryContentProps> = ({
  otherProtoGroups,
  protoCategories,
  uncategorizedOtherEmails,
  globalIndex,
  convertingProtoCategoryId,
  deletingProtoCategoryId,
  onBulkArchive,
  onConvertProtoCategory,
  onDeleteProtoCategoryFromInbox,
  renderItem,
}) => {
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
            onConvertToCategory={() => onConvertProtoCategory(protoCategory?.id ?? '', group.name)}
            isConverting={convertingProtoCategoryId === protoCategory?.id && protoCategory !== undefined}
            onArchiveAll={onBulkArchive}
            emailIds={group.emails.map(email => email.id)}
            onDelete={protoCategory ? () => onDeleteProtoCategoryFromInbox(protoCategory.id) : undefined}
            isDeleting={deletingProtoCategoryId === protoCategory?.id && protoCategory !== undefined}
          >
            {group.emails.map((email, i) => renderItem(email, globalIndex + groupStart + i))}
          </ProtoCategorySubAccordion>
        );
      })}
      {uncategorizedOtherEmails.map((email, i) => renderItem(email, globalIndex + offset + i))}
    </>
  );
};

// ---------------------------------------------------------------------------
// InboxCategoryItem — renders a single CategoryAccordion with its children
// ---------------------------------------------------------------------------

export interface InboxCategoryItemProps {
  categoryItem: { id: string | null; name: string; count: number };
  categoryKey: string;
  /** Raw (un-merged) category summary, so the admin debug panel can expose duplicate-name UUIDs. */
  categorySummary?: CategorySummaryItem[] | null;
  isExpanded: boolean;
  isLoaded: boolean;
  group: CategoryGroup | undefined;
  globalIndex: number;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: ProtoCategory[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  mode: InboxMode;
  onToggleCategory: (categoryKey: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  renderItem: (email: Email, index: number) => React.ReactNode;
  /** Called after this category auto-collapses, to scroll the next category into view. */
  onAfterCollapse?: () => void;
}

export const InboxCategoryItem: React.FC<InboxCategoryItemProps> = ({
  categoryItem,
  categoryKey,
  categorySummary,
  isExpanded,
  isLoaded,
  group,
  globalIndex,
  otherProtoGroups,
  protoCategories,
  isReanalysingOther,
  convertingProtoCategoryId,
  deletingProtoCategoryId,
  mode,
  onToggleCategory,
  onBulkArchive,
  onConvertProtoCategory,
  onDeleteProtoCategoryFromInbox,
  onReanalyseOther,
  renderItem,
  onAfterCollapse,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAuth();
  const { debugViewOpen } = useDebugViewOpen();
  // Admin debug surfaces only appear once the bug icon has enabled debug mode.
  const isAdmin = user?.isAdmin === true && debugViewOpen;
  const categoryName = categoryItem.name;
  const categoryEmails = group?.emails ?? [];
  // Match the badge value the user sees: emails.length when loaded, otherwise
  // the cached summary count. A never-expanded category with summary.count > 0
  // displays a non-zero badge and does NOT count as empty — only render the
  // admin debug panel for accordions that actually appear at "0" on screen.
  const displayedCount = isLoaded ? categoryEmails.length : categoryItem.count;
  const isEmptyForAdminDebug = isAdmin && displayedCount === 0;
  // Budget warning: subtle amber indicator when this category's fetch is approaching budget.
  const isNearBudget = useSelector(selectCategoryBudgetWarning(categoryKey));

  // --- Performance budget instrumentation ---
  const perf = usePerformanceBudget();
  const renderStartRef = useRef<number | null>(null);

  // Wrapped toggle that marks the start of a total click-to-visible span (only when expanding).
  const handleToggleWithTiming = useCallback(
    (key: string) => {
      if (!isExpanded) {
        perf.markStart(`category-total:${categoryName}`);
      }
      onToggleCategory(key);
    },
    [isExpanded, categoryName, onToggleCategory, perf]
  );

  // Mark end of total click-to-visible span when category finishes loading.
  useEffect(() => {
    if (isExpanded && isLoaded) {
      perf.markEnd(`category-total:${categoryName}`, ACCORDION_BUDGETS.CATEGORY_TOTAL);
    }
  }, [isExpanded, isLoaded, categoryName, perf]);

  // Measure paint time from data-ready to painted using requestAnimationFrame.
  // RAF fires after the next paint, so this measures commit-to-paint latency (not React render time).
  useEffect(() => {
    let rafId: number | null = null;

    if (isLoaded && isExpanded && renderStartRef.current === null) {
      renderStartRef.current = performance.now();
      rafId = requestAnimationFrame(() => {
        if (renderStartRef.current !== null) {
          const durationMs = Math.round(performance.now() - renderStartRef.current);
          const budget = ACCORDION_BUDGETS.CATEGORY_PAINT;
          if (durationMs > budget) {
            devWarn(
              `[PerfBudget] category-paint:${categoryName} exceeded budget: ${durationMs}ms > ${budget}ms (overage: ${durationMs - budget}ms)`
            );
          } else {
            devLog(`[PerfBudget] category-paint:${categoryName} within budget: ${durationMs}ms / ${budget}ms`);
          }
          renderStartRef.current = null;
        }
      });
    }
    if (!isExpanded) {
      renderStartRef.current = null;
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isLoaded, isExpanded, categoryName]);

  // Auto-collapse when all emails in this category have been archived one-by-one.
  // We guard with isLoaded so we don't collapse during the initial load (when the
  // email list is empty before the first fetch completes). The isExpanded guard
  // ensures we only call onToggleCategory when collapsing is needed (prevents
  // calling toggle on an already-collapsed category and re-expanding it).
  // We also require categoryItem.count === 0 so that categories whose server
  // summary still shows emails (e.g. "Other" with a priority-filtered fetch that
  // returns 0 results) are not incorrectly auto-collapsed — the user explicitly
  // expanded them and should see an empty accordion rather than it snapping shut.
  useEffect(() => {
    // Admins keep empty categories expanded so the inline debug panel stays visible.
    if (isAdmin) {
      return;
    }
    if (isLoaded && categoryEmails.length === 0 && isExpanded && categoryItem.count === 0) {
      onToggleCategory(categoryKey);
      onAfterCollapse?.();
    }
  }, [isAdmin, isLoaded, categoryEmails.length, categoryKey, isExpanded, onToggleCategory, categoryItem.count, onAfterCollapse]);
  const isOtherCategory = categoryName === CATEGORY_OTHER;
  const hasProtoGroups = isOtherCategory && otherProtoGroups.length > 0;

  const protoGroupedEmailIds = hasProtoGroups
    ? new Set(otherProtoGroups.flatMap(grp => grp.emails.map(email => email.id)))
    : new Set<string>();
  const uncategorizedOtherEmails = hasProtoGroups
    ? categoryEmails.filter(email => !protoGroupedEmailIds.has(email.id))
    : [];

  const handleArchiveAll = async (catName: string, ids: string[]) => {
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
      // categoryItem.id must be a UUID — missing UUID is a server-side data bug.
      params.append(PARAM_CATEGORY_IDS, categoryItem.id ?? catName);
      params.append('limit', INBOX_FETCH_LIMIT.toString());
      params.append('offset', '0');
      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      const fetchedEmails = response.data?.emails || [];
      const fetchedIds = fetchedEmails.map((email: { id?: string }) => email.id).filter(Boolean);
      if (fetchedIds.length > 0) {
        await onBulkArchive(fetchedIds);
        // Mark the category as loaded and decrement the summary count so the ghost accordion
        // disappears. Without these dispatches the hide guard in InboxCategoryList
        // (`isLoaded && categoryEmails.length === 0 && categoryItem.count === 0`) is never
        // satisfied because neither condition is met for a collapsed-then-archived category.
        // TODO: this only covers the first page (INBOX_FETCH_LIMIT). If a category has more
        // emails than the fetch limit, the count will be under-decremented. Pagination is a
        // pre-existing limitation of the fallback fetch and is out of scope for this fix.
        dispatch(markCategoryLoaded(categoryKey));
        dispatch(
          decrementCategorySummaryCount({
            categoryKey: categoryItem.id ?? CATEGORY_KEY_UNCATEGORIZED,
            count: fetchedIds.length,
          })
        );
      }
    } catch (err) {
      console.error('[InboxContent] Failed to load category emails for archive:', err);
    }
  };


  return (
    <>
      <CategoryAccordion
        key={categoryKey}
        category={categoryName}
        categoryId={categoryItem.id}
        categoryKey={categoryKey}
        emails={categoryEmails}
        count={isLoaded ? categoryEmails.length : categoryItem.count}
        isLoadingContent={isExpanded && !isLoaded}
        isExpanded={isExpanded}
        onToggle={() => handleToggleWithTiming(categoryKey)}
        onArchiveAll={handleArchiveAll}
        onReanalyseOther={onReanalyseOther}
        isReanalysingOther={isReanalysingOther}
        onAfterCollapse={onAfterCollapse}
        isNearBudget={isNearBudget}
      >
        {hasProtoGroups ? (
          <InboxOtherCategoryContent
            otherProtoGroups={otherProtoGroups}
            protoCategories={protoCategories}
            uncategorizedOtherEmails={uncategorizedOtherEmails}
            globalIndex={globalIndex}
            convertingProtoCategoryId={convertingProtoCategoryId}
            deletingProtoCategoryId={deletingProtoCategoryId}
            onBulkArchive={onBulkArchive}
            onConvertProtoCategory={onConvertProtoCategory}
            onDeleteProtoCategoryFromInbox={onDeleteProtoCategoryFromInbox}
            renderItem={renderItem}
          />
        ) : (
          categoryEmails.map((email, indexInCategory) => renderItem(email, globalIndex + indexInCategory))
        )}
      </CategoryAccordion>
      {isEmptyForAdminDebug && (
        <CategoryDebugPanel
          categoryItem={categoryItem}
          categoryKey={categoryKey}
          categoryEmailsLength={categoryEmails.length}
          isLoaded={isLoaded}
          isExpanded={isExpanded}
          categorySummary={categorySummary ?? null}
          mode={mode}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// InboxCategoryList — renders the category accordion list
// ---------------------------------------------------------------------------

interface InboxCategoryListProps {
  displayCategories: Array<{ id: string | null; name: string; count: number }>;
  emailCategoryMap: Map<string, CategoryGroup>;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: ProtoCategory[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  expandedCategories: Set<string>;
  loadedCategoryNames?: string[];
  /** Raw (un-merged) category summary, forwarded to InboxCategoryItem for the admin debug panel. */
  categorySummary?: CategorySummaryItem[] | null;
  mode: InboxMode;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  onToggleCategory: (category: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  renderItem: (email: Email, index: number) => React.ReactNode;
}

/** Stable empty map: disables family grouping without re-memoising every render. */
const EMPTY_FAMILY_MAP = new Map<string, string>();

/** How long (ms) to wait after collapse before scrolling — allows the 0.25s CSS grid animation to finish. */
const COLLAPSE_ANIMATION_MS = 260;

const InboxCategoryList: React.FC<InboxCategoryListProps> = ({
  displayCategories,
  emailCategoryMap,
  otherProtoGroups,
  protoCategories,
  isReanalysingOther,
  convertingProtoCategoryId,
  deletingProtoCategoryId,
  expandedCategories,
  loadedCategoryNames,
  categorySummary,
  mode,
  emailListRef,
  onToggleCategory,
  onBulkArchive,
  onConvertProtoCategory,
  onDeleteProtoCategoryFromInbox,
  onReanalyseOther,
  renderItem,
}) => {
  const { user } = useAuth();
  const { debugViewOpen } = useDebugViewOpen();
  // Admin debug surfaces only appear once the bug icon has enabled debug mode.
  const isAdmin = user?.isAdmin === true && debugViewOpen;

  // Two-level accordion: group the category list under family headers. Until
  // families load (or for users with none) `grouping.isGrouped` is false and we
  // render the flat list exactly as before — no behavioural change.
  //
  // Action and Follow Up always render the flat list — see familyGroupingAppliesTo.
  const { familyByCategoryId } = useCategoryFamilyMap();
  // EMPTY_FAMILY_MAP is stable, so family-map updates don't recompute the memo
  // in the modes that ignore families.
  const effectiveFamilyMap = familyGroupingAppliesTo(mode) ? familyByCategoryId : EMPTY_FAMILY_MAP;
  const grouping = useMemo(
    () => orderCategoriesByFamily(displayCategories, effectiveFamilyMap),
    [displayCategories, effectiveFamilyMap]
  );
  const orderedCategories = grouping.ordered;
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const toggleFamily = useCallback((family: string) => {
    setCollapsedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(family)) {
next.delete(family);
} else {
next.add(family);
}
      return next;
    });
  }, []);
  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    grouping.familyByKey.forEach(family => counts.set(family, (counts.get(family) ?? 0) + 1));
    return counts;
  }, [grouping.familyByKey]);
  /**
   * Build a callback that scrolls the email list back up to the collapsed category's
   * header after it collapses. Delayed by COLLAPSE_ANIMATION_MS to allow the CSS grid
   * animation to complete before measuring element positions.
   *
   * Only scrolls UP — if the user has not scrolled past the category header there is
   * nothing to correct, and scrolling down would be disorienting. This fixes the case
   * where the category is near the top of the screen and a downward scroll was
   * incorrectly triggered (issue #1157).
   *
   * Uses `data-category-key` attributes on `CategoryAccordion` root divs (consistent
   * with the existing `data-email-index` pattern used by keyboard shortcuts).
   */
  const makeAfterCollapseHandler = useCallback(
    (collapsedKey: string) => () => {
      const scrollContainer = emailListRef.current;
      if (!scrollContainer) {
        return;
      }

      const escapedKey = CSS.escape(collapsedKey);
      const collapsedEl = scrollContainer.querySelector<HTMLElement>(`[data-category-key="${escapedKey}"]`);
      if (!collapsedEl) {
        return;
      }

      // Capture the target position immediately to avoid race conditions with DOM removal.
      // The category element may be removed before the timeout fires (e.g. all emails archived),
      // so we measure here while it's still in the DOM.
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const collapsedTop = collapsedEl.getBoundingClientRect().top;
      const targetScrollTop = scrollContainer.scrollTop + (collapsedTop - containerTop);

      setTimeout(() => {
        const container = emailListRef.current;
        // Only scroll when the user has scrolled PAST the category header (i.e. the
        // header is above the visible area). Scrolling down would be wrong and
        // disorienting when the category is already at or near the top of the screen.
        if (container && container.scrollTop > targetScrollTop) {
          container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
      }, COLLAPSE_ANIMATION_MS);
    },
    [emailListRef]
  );

  return (
    <>
      {orderedCategories.map((categoryItem, catIdx) => {
        const categoryKey = getCategoryKey(categoryItem.id, categoryItem.name);
        const isExpanded = expandedCategories.has(categoryKey);
        const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
        const group = emailCategoryMap.get(categoryKey);
        const categoryEmails = group?.emails ?? [];

        // Two-level accordion bits. `family` is undefined when not grouping.
        const family = grouping.isGrouped ? grouping.familyByKey.get(categoryKey) : undefined;
        const isFamilyCollapsed = family !== undefined && collapsedFamilies.has(family);
        const familyHeader =
          family !== undefined && grouping.firstInFamily.has(categoryKey) ? (
            <InboxFamilyHeader
              family={family}
              categoryCount={familyCounts.get(family) ?? 0}
              isCollapsed={isFamilyCollapsed}
              onToggle={() => toggleFamily(family)}
            />
          ) : null;

        // Hide category once loaded with no remaining emails AND the server summary
        // also reports zero. Without the count guard, a category disappears when a
        // priority-filtered category fetch returns fewer emails than the cached summary
        // (e.g. "Other" accordion expands but emails never display because all emails
        // have priority < minPriority). Requiring categoryItem.count === 0 ensures we
        // only hide after the server has confirmed the category is truly empty.
        //
        // Admins keep empty categories rendered so the inline CategoryDebugPanel can
        // explain why they are still here (issue #2062).
        // Render the category as header-only (or nothing) when it's an empty
        // loaded category, or when its family is collapsed. In both cases the
        // family header still shows if this is the family's first category, so
        // the header doesn't vanish when its lead category empties/collapses.
        const isEmptyLoaded =
          !isAdmin && isLoaded && categoryEmails.length === 0 && categoryItem.count === 0;
        if (isEmptyLoaded || isFamilyCollapsed) {
          return familyHeader ? (
            <React.Fragment key={categoryKey}>{familyHeader}</React.Fragment>
          ) : null;
        }

        let globalIndex = 0;
        for (let i = 0; i < catIdx; i++) {
          const prev = orderedCategories[i];
          const prevKey = getCategoryKey(prev.id, prev.name);
          const prevFamily = grouping.isGrouped ? grouping.familyByKey.get(prevKey) : undefined;
          const prevHidden = prevFamily !== undefined && collapsedFamilies.has(prevFamily);
          if (expandedCategories.has(prevKey) && !prevHidden) {
            globalIndex += emailCategoryMap.get(prevKey)?.emails.length ?? 0;
          }
        }

        return (
          <React.Fragment key={categoryKey}>
            {familyHeader}
            <InboxCategoryItem
              categoryItem={categoryItem}
              categoryKey={categoryKey}
              categorySummary={categorySummary}
              isExpanded={isExpanded}
              isLoaded={isLoaded}
              group={group}
              globalIndex={globalIndex}
              otherProtoGroups={otherProtoGroups}
              protoCategories={protoCategories}
              isReanalysingOther={isReanalysingOther}
              convertingProtoCategoryId={convertingProtoCategoryId}
              deletingProtoCategoryId={deletingProtoCategoryId}
              mode={mode}
              onToggleCategory={onToggleCategory}
              onBulkArchive={onBulkArchive}
              onConvertProtoCategory={onConvertProtoCategory}
              onDeleteProtoCategoryFromInbox={onDeleteProtoCategoryFromInbox}
              onReanalyseOther={onReanalyseOther}
              renderItem={renderItem}
              onAfterCollapse={makeAfterCollapseHandler(categoryKey)}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// InboxEmailListPanel — the scrollable left panel containing the email list
// ---------------------------------------------------------------------------

export interface InboxEmailListPanelProps {
  emailListRef: React.RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  splitView: {
    selectedEmailId: string | null | undefined;
    splitPosition: number;
    isResizing: boolean;
    panelExpanded: boolean;
  };
  mode: InboxMode;
  emails: Email[];
  loading: boolean;
  isRefetchingWithoutData: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  isGeneratingDrafts: boolean;
  followUpsError: string | null;
  categorySummary?: CategorySummaryItem[] | null;
  displayCategories: Array<{ id: string | null; name: string; count: number }>;
  emailCategoryMap: Map<string, CategoryGroup>;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: ProtoCategory[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  expandedCategories: Set<string>;
  loadedCategoryNames?: string[];
  selectedEmailIds: Set<string>;
  selectedEmailIndex: number;
  triageSuggestions: Map<string, TriageSuggestion>;
  followUpDataMap: Map<string, FollowUpData>;
  priorityTooltip: InboxPriorityTooltip;
  keyboardHint: InboxKeyboardHint;
  snoozeInput: InboxSnoozeInput;
  emailActions: InboxEmailActions;
  modals: InboxModals;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent) => void;
  onSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
  onGenerateDrafts: () => Promise<void>;
  onRetry: () => void;
  onToggleCategory: (category: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  /** Current active priority filter lower bound for progressive unlock */
  minPriority?: number | null;
  /** Current active priority filter upper bound (null = no upper cap) */
  maxPriority?: number | null;
  /** Counts of threads per priority tier for progressive unlock prompt */
  priorityCounts?: {
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
    unprioritised: number;
  } | null;
  /** Called when user accepts progressive unlock to a lower priority tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
  /** Called when user clicks "Show all emails" to clear the priority filter */
  onClearFilters?: () => void;
  /** Count of threads not yet prioritised (priorityScore IS NULL) — used for the virtual "Analysing priority..." category */
  unprioritisedCount?: number;
}

export const InboxEmailListPanel: React.FC<InboxEmailListPanelProps> = props => {
  const {
    emailListRef,
    isMobile,
    splitView,
    mode,
    emails,
    loading,
    isRefetchingWithoutData,
    hasInitiallyLoaded,
    loadingModeSwitch,
    decrypting,
    fetchError,
    nextDelivery,
    lastUrgentCheck,
    isGeneratingDrafts,
    followUpsError,
    categorySummary,
    displayCategories,
    emailCategoryMap,
    otherProtoGroups,
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    expandedCategories,
    loadedCategoryNames,
    selectedEmailIds,
    selectedEmailIndex,
    triageSuggestions,
    followUpDataMap,
    priorityTooltip,
    keyboardHint,
    snoozeInput,
    emailActions,
    modals,
    updateDraft,
    onEmailClick,
    onEmailSelect,
    onSendFollowUp,
    onGenerateDrafts,
    onRetry,
    onToggleCategory,
    onBulkArchive,
    onConvertProtoCategory,
    onDeleteProtoCategoryFromInbox,
    onReanalyseOther,
    minPriority,
    maxPriority,
    priorityCounts,
    onUnlockPriorityTier,
    onDismissUnlockPrompt,
    onClearFilters,
    unprioritisedCount,
  } = props;

  const { isDebugModeEnabled } = useDebugMode();
  const panelFlex = computeEmailListFlex(splitView);
  const canRenderCategories = computeCanRenderCategories({
    loading,
    isRefetchingWithoutData,
    hasInitiallyLoaded,
    loadingModeSwitch,
    fetchError,
    categoriesCount: displayCategories.length,
  });
  const emailsEmpty = computeIsEmailsEmpty(
    isRefetchingWithoutData,
    categorySummary,
    loading,
    loadingModeSwitch,
    emails.length
  );

  // Poll the mailbox sync status only while the inbox is genuinely empty after
  // an initial load — so a first sync surfaces a "Syncing…" state and refetches
  // on completion, without polling forever on a populated inbox.
  const { isSyncing } = useSyncStatus({
    enabled: hasInitiallyLoaded && emailsEmpty && !loading && !loadingModeSwitch && !fetchError,
    onSyncComplete: onRetry,
  });

  const renderItem = (email: Email, emailIndex: number) => (
    <InboxEmailItem
      key={email.id}
      email={email}
      emailIndex={emailIndex}
      mode={mode}
      selectedEmailIds={selectedEmailIds}
      selectedEmailIndex={selectedEmailIndex}
      splitViewSelectedEmailId={splitView.selectedEmailId}
      triageSuggestions={triageSuggestions}
      followUpDataMap={followUpDataMap}
      priorityTooltip={priorityTooltip}
      keyboardHint={keyboardHint}
      snoozeInput={snoozeInput}
      emailActions={emailActions}
      modals={modals}
      updateDraft={updateDraft}
      onEmailClick={onEmailClick}
      onEmailSelect={onEmailSelect}
      onSendFollowUp={onSendFollowUp}
      recipientName={email.otherPersonName ?? undefined}
    />
  );

  const categoryListProps = {
    displayCategories,
    emailCategoryMap,
    otherProtoGroups,
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    expandedCategories,
    loadedCategoryNames,
    categorySummary,
    mode,
    emailListRef,
    onToggleCategory,
    onBulkArchive,
    onConvertProtoCategory,
    onDeleteProtoCategoryFromInbox,
    onReanalyseOther,
    renderItem,
  };

  // Scheduled mode: render ScheduledEmailsManager inside the inbox shell
  if (mode === MODE_SCHEDULED) {
    return (
      <div
        ref={emailListRef}
        tabIndex={0}
        style={{
          flex: panelFlex,
          overflowY: 'auto',
          padding: isMobile
            ? `${theme.spacing.sm} ${theme.spacing.xs}`
            : `${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg}`,
          minWidth: 0,
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <ScheduledEmailsManager />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={emailListRef}
      tabIndex={0}
      style={{
        flex: panelFlex,
        overflowY: 'auto',
        padding: isMobile
          ? `${theme.spacing.sm} ${theme.spacing.xs}`
          : `${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg}`,
        transition: splitView.isResizing ? 'none' : 'flex 0.3s ease',
        borderRight: computeEmailListBorderRight(splitView, isMobile),
        minWidth: 0,
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
        {mode === MODE_TRIAGE && (
          <>
            <BatchInfoBar nextDelivery={nextDelivery} lastUrgentCheck={lastUrgentCheck} />
            <TriageBatchSummary counts={priorityCounts} isVisible={canRenderCategories} />
          </>
        )}
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
          emailsEmpty={emailsEmpty}
          mode={mode}
          isSyncing={isSyncing}
          onRetry={onRetry}
          minPriority={minPriority}
          maxPriority={maxPriority}
          priorityCounts={priorityCounts}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={onDismissUnlockPrompt}
          onClearFilters={onClearFilters}
        />
        {canRenderCategories &&
          unprioritisedCount !== null &&
          unprioritisedCount !== undefined &&
          unprioritisedCount > 0 && <AnalysingPriorityCategory count={unprioritisedCount} />}
        {canRenderCategories && <InboxCategoryList {...categoryListProps} />}
        {isDebugModeEnabled && <DebugView emails={emails} />}
      </div>
    </div>
  );
};
