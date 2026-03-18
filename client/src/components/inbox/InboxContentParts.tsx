/**
 * Sub-components extracted from InboxContent to keep individual functions within
 * the max-lines-per-function limit. All components are co-located here because they
 * are only used by InboxContent.
 */
import React, { useCallback, useEffect } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, InboxMode } from 'types/email';

import { BatchInfoBar } from 'components/inbox/BatchInfoBar';
import { CategoryAccordion, CategoryGroup } from 'components/inbox/CategoryAccordion';
import { DebugView } from 'components/inbox/DebugView';
import { EmailListItem } from 'components/inbox/EmailListItem';
import { EmailListStates } from 'components/inbox/EmailListStates';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { ProtoCategorySubAccordion } from 'components/inbox/ProtoCategorySubAccordion';
import { ScheduledEmailsManager } from 'components/scheduled-emails/ScheduledEmailsManager';
import { API_URL } from 'config/api';
import { INBOX_FETCH_LIMIT } from 'constants/numbers';
import {
  CATEGORY_OTHER,
  MODE_FOLLOW_UP,
  MODE_SCHEDULED,
  MODE_TRIAGE,
  PARAM_CATEGORY_IDS,
} from 'constants/strings';
import { useDebugMode } from 'hooks/useDebugMode';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

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
  triageSuggestions: Map<string, any>;
  followUpDataMap: Map<string, any>;
  priorityTooltip: any;
  keyboardHint: any;
  snoozeInput: any;
  emailActions: any;
  modals: any;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent) => void;
  onSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
  recipientName?: string;
}

export const InboxEmailItem: React.FC<InboxEmailItemProps> = ({
  email,
  emailIndex,
  mode,
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
  recipientName,
}) => {
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
  protoCategories: any[];
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
  isExpanded: boolean;
  isLoaded: boolean;
  group: CategoryGroup | undefined;
  globalIndex: number;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: any[];
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
  const categoryName = categoryItem.name;
  const categoryEmails = group?.emails ?? [];

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
    if (isLoaded && categoryEmails.length === 0 && isExpanded && categoryItem.count === 0) {
      onToggleCategory(categoryKey);
      onAfterCollapse?.();
    }
  }, [isLoaded, categoryEmails.length, categoryKey, isExpanded, onToggleCategory, categoryItem.count, onAfterCollapse]);
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
      const fetchedIds = fetchedEmails.map((email: any) => email.id).filter(Boolean);
      if (fetchedIds.length > 0) {
        await onBulkArchive(fetchedIds);
      }
    } catch (err) {
      console.error('[InboxContent] Failed to load category emails for archive:', err);
    }
  };

  return (
    <CategoryAccordion
      key={categoryKey}
      category={categoryName}
      categoryKey={categoryKey}
      emails={categoryEmails}
      count={isLoaded ? categoryEmails.length : categoryItem.count}
      isLoadingContent={isExpanded && !isLoaded}
      isExpanded={isExpanded}
      onToggle={() => onToggleCategory(categoryKey)}
      onArchiveAll={handleArchiveAll}
      onReanalyseOther={onReanalyseOther}
      isReanalysingOther={isReanalysingOther}
      onAfterCollapse={onAfterCollapse}
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
  );
};

// ---------------------------------------------------------------------------
// InboxCategoryList — renders the category accordion list
// ---------------------------------------------------------------------------

interface InboxCategoryListProps {
  displayCategories: Array<{ id: string | null; name: string; count: number }>;
  emailCategoryMap: Map<string, CategoryGroup>;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: any[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  expandedCategories: Set<string>;
  loadedCategoryNames?: string[];
  mode: InboxMode;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  onToggleCategory: (category: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  renderItem: (email: Email, index: number) => React.ReactNode;
}

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
  mode,
  emailListRef,
  onToggleCategory,
  onBulkArchive,
  onConvertProtoCategory,
  onDeleteProtoCategoryFromInbox,
  onReanalyseOther,
  renderItem,
}) => {
  /**
   * Build a callback that scrolls the email list to the next (or previous) category
   * after the category at `catIdx` collapses. Delayed by COLLAPSE_ANIMATION_MS to
   * allow the CSS grid animation to complete before we measure element positions.
   *
   * Uses `data-category-key` attributes on `CategoryAccordion` root divs (consistent
   * with the existing `data-email-index` pattern used by keyboard shortcuts).
   */
  const makeAfterCollapseHandler = useCallback(
    (collapsedKey: string, catIdx: number) => () => {
      setTimeout(() => {
        const scrollContainer = emailListRef.current;
        if (!scrollContainer) {
          return;
        }

        // Find the next visible category (after the collapsed one), falling back
        // to the previous if the collapsed category was the last in the list.
        const visibleCategories = displayCategories.filter((cat, idx) => {
          const key = getCategoryKey(cat.id, cat.name);
          if (key === collapsedKey) {
            return false;
          }
          const grp = emailCategoryMap.get(key);
          const loaded = (loadedCategoryNames ?? []).includes(key);
          // Mirror the hide logic in the render loop: only exclude when loaded+empty
          return !(loaded && (grp?.emails ?? []).length === 0 && cat.count === 0);
        });

        // Determine the sibling to scroll to
        const collapsedVisibleIdx = displayCategories.slice(0, catIdx).filter((cat) => {
          const key = getCategoryKey(cat.id, cat.name);
          const grp = emailCategoryMap.get(key);
          const loaded = (loadedCategoryNames ?? []).includes(key);
          return !(loaded && (grp?.emails ?? []).length === 0 && cat.count === 0);
        }).length;

        const nextCategory = visibleCategories[collapsedVisibleIdx] ?? visibleCategories[collapsedVisibleIdx - 1];
        if (!nextCategory) {
          return;
        }

        const targetKey = getCategoryKey(nextCategory.id, nextCategory.name);
        const escapedKey = CSS.escape(targetKey);
        const targetEl = scrollContainer.querySelector<HTMLElement>(`[data-category-key="${escapedKey}"]`);
        if (!targetEl) {
          return;
        }

        const containerTop = scrollContainer.getBoundingClientRect().top;
        const targetTop = targetEl.getBoundingClientRect().top;
        const scrollDelta = targetTop - containerTop;

        scrollContainer.scrollBy({ top: scrollDelta, behavior: 'smooth' });
      }, COLLAPSE_ANIMATION_MS);
    },
    [displayCategories, emailCategoryMap, loadedCategoryNames, emailListRef],
  );

  return (
    <>
      {displayCategories.map((categoryItem, catIdx) => {
        const categoryKey = getCategoryKey(categoryItem.id, categoryItem.name);
        const isExpanded = expandedCategories.has(categoryKey);
        const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
        const group = emailCategoryMap.get(categoryKey);
        const categoryEmails = group?.emails ?? [];

        // Hide category once loaded with no remaining emails AND the server summary
        // also reports zero. Without the count guard, a category disappears when a
        // priority-filtered category fetch returns fewer emails than the cached summary
        // (e.g. "Other" accordion expands but emails never display because all emails
        // have priority < minPriority). Requiring categoryItem.count === 0 ensures we
        // only hide after the server has confirmed the category is truly empty.
        if (isLoaded && categoryEmails.length === 0 && categoryItem.count === 0) {
          return null;
        }

        let globalIndex = 0;
        for (let i = 0; i < catIdx; i++) {
          const prevKey = getCategoryKey(displayCategories[i].id, displayCategories[i].name);
          globalIndex += emailCategoryMap.get(prevKey)?.emails.length ?? 0;
        }

        return (
          <InboxCategoryItem
            key={categoryKey}
            categoryItem={categoryItem}
            categoryKey={categoryKey}
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
            onAfterCollapse={makeAfterCollapseHandler(categoryKey, catIdx)}
          />
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
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  splitView: { selectedEmailId: string | null | undefined; splitPosition: number; isResizing: boolean; panelExpanded: boolean };
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
  protoCategories: any[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null | undefined;
  deletingProtoCategoryId: string | null | undefined;
  expandedCategories: Set<string>;
  loadedCategoryNames?: string[];
  hasMore?: boolean;
  selectedEmailIds: Set<string>;
  selectedEmailIndex: number;
  triageSuggestions: Map<string, any>;
  followUpDataMap: Map<string, any>;
  priorityTooltip: any;
  keyboardHint: any;
  snoozeInput: any;
  emailActions: any;
  modals: any;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent) => void;
  onSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
  onGenerateDrafts: () => Promise<void>;
  onRetry: () => void;
  onToggleCategory: (category: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  /** Current active priority filter for progressive unlock */
  minPriority?: number | null;
  /** Counts of threads per priority tier for progressive unlock prompt */
  priorityCounts?: { high: number; medium: number; low: number } | null;
  /** Called when user accepts progressive unlock to a lower priority tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
}

export const InboxEmailListPanel: React.FC<InboxEmailListPanelProps> = (props) => {
  const {
    emailListRef, sentinelRef, isMobile, splitView, mode, emails, loading,
    isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, decrypting, fetchError,
    nextDelivery, lastUrgentCheck, isGeneratingDrafts, followUpsError, categorySummary,
    displayCategories, emailCategoryMap, otherProtoGroups, protoCategories, isReanalysingOther,
    convertingProtoCategoryId, deletingProtoCategoryId, expandedCategories, loadedCategoryNames,
    hasMore, selectedEmailIds, selectedEmailIndex, triageSuggestions, followUpDataMap,
    priorityTooltip, keyboardHint, snoozeInput, emailActions, modals, updateDraft,
    onEmailClick, onEmailSelect, onSendFollowUp, onGenerateDrafts, onRetry,
    onToggleCategory, onBulkArchive, onConvertProtoCategory, onDeleteProtoCategoryFromInbox, onReanalyseOther,
    minPriority, priorityCounts, onUnlockPriorityTier, onDismissUnlockPrompt,
  } = props;

  const { isDebugModeEnabled } = useDebugMode();
  const panelFlex = computeEmailListFlex(splitView);
  const canRenderCategories = computeCanRenderCategories(
    loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError, displayCategories.length
  );
  const emailsEmpty = computeIsEmailsEmpty(isRefetchingWithoutData, categorySummary, loading, loadingModeSwitch, emails.length);

  const renderItem = (email: Email, emailIndex: number) => (
    <InboxEmailItem
      key={email.id}
      email={email}
      emailIndex={emailIndex}
      mode={mode}
      selectedEmailIds={selectedEmailIds}
      selectedEmailIndex={selectedEmailIndex}
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
      recipientName={(email as any).otherPersonName}
    />
  );

  const categoryListProps = {
    displayCategories, emailCategoryMap, otherProtoGroups, protoCategories, isReanalysingOther,
    convertingProtoCategoryId, deletingProtoCategoryId, expandedCategories, loadedCategoryNames,
    mode, emailListRef, onToggleCategory, onBulkArchive, onConvertProtoCategory, onDeleteProtoCategoryFromInbox,
    onReanalyseOther, renderItem,
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
        {mode === MODE_TRIAGE && <BatchInfoBar nextDelivery={nextDelivery} lastUrgentCheck={lastUrgentCheck} />}
        {mode === MODE_FOLLOW_UP && (
          <FollowUpActions onGenerateDrafts={onGenerateDrafts} isGenerating={isGeneratingDrafts} error={followUpsError} onRetry={onRetry} />
        )}
        <EmailListStates
          loading={loading || isRefetchingWithoutData}
          hasInitiallyLoaded={hasInitiallyLoaded}
          loadingModeSwitch={loadingModeSwitch}
          decrypting={decrypting}
          fetchError={fetchError}
          emailsEmpty={emailsEmpty}
          mode={mode}
          onRetry={onRetry}
          minPriority={minPriority}
          priorityCounts={priorityCounts}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={onDismissUnlockPrompt}
        />
        {canRenderCategories && <InboxCategoryList {...categoryListProps} />}
        {hasMore && !loading && !loadingModeSwitch && hasInitiallyLoaded && (
          <div ref={sentinelRef} style={{ height: '1px', visibility: 'hidden' }} aria-hidden="true" />
        )}
        {isDebugModeEnabled && <DebugView emails={emails} />}
      </div>
    </div>
  );
};
