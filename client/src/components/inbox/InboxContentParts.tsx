/**
 * Sub-components extracted from InboxContent to keep individual functions within
 * the max-lines-per-function limit. All components are co-located here because they
 * are only used by InboxContent.
 */
import React, { useEffect } from 'react';
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
  PARAM_CATEGORIES,
  PARAM_CATEGORY_IDS,
} from 'constants/strings';
import { useDebugMode } from 'hooks/useDebugMode';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

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
}) => {
  const categoryName = categoryItem.name;
  const categoryEmails = group?.emails ?? [];

  // Auto-collapse when all emails in this category have been archived one-by-one.
  // We guard with isLoaded so we don't collapse during the initial load (when the
  // email list is empty before the first fetch completes). The isExpanded guard
  // ensures we only call onToggleCategory when collapsing is needed (prevents
  // calling toggle on an already-collapsed category and re-expanding it).
  useEffect(() => {
    if (isLoaded && categoryEmails.length === 0 && isExpanded) {
      onToggleCategory(categoryKey);
    }
  }, [isLoaded, categoryEmails.length, categoryKey, isExpanded, onToggleCategory]);
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
      if (categoryItem.id) {
        params.append(PARAM_CATEGORY_IDS, categoryItem.id);
      } else {
        params.append(PARAM_CATEGORIES, catName);
      }
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
      emails={categoryEmails}
      count={isLoaded ? categoryEmails.length : categoryItem.count}
      isLoadingContent={isExpanded && !isLoaded}
      isExpanded={isExpanded}
      onToggle={() => onToggleCategory(categoryKey)}
      onArchiveAll={handleArchiveAll}
      onReanalyseOther={onReanalyseOther}
      isReanalysingOther={isReanalysingOther}
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
// Helper functions for InboxEmailListPanel
// ---------------------------------------------------------------------------

function computeEmailListBorderRight(
  splitView: {
    selectedEmailId: string | null | undefined;
    panelExpanded: boolean;
  },
  isMobile: boolean,
): string {
  if (!isMobile && splitView.selectedEmailId && !splitView.panelExpanded) {
    return `1px solid ${theme.colors.border.light}`;
  }
  return 'none';
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
  categorySummary: CategorySummaryItem[] | null | undefined,
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

function computeEmailListFlex(splitView: {
  selectedEmailId: string | null | undefined;
  panelExpanded: boolean;
  splitPosition: number;
}): number | string {
  if (splitView.panelExpanded && splitView.selectedEmailId) {
    return 0;
  }
  if (splitView.selectedEmailId) {
    return `0 0 ${splitView.splitPosition}%`;
  }
  return 1;
}

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
  onToggleCategory: (category: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  onConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  onDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  onReanalyseOther: () => void;
  renderItem: (email: Email, index: number) => React.ReactNode;
}

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
  onToggleCategory,
  onBulkArchive,
  onConvertProtoCategory,
  onDeleteProtoCategoryFromInbox,
  onReanalyseOther,
  renderItem,
}) => (
  <>
    {displayCategories.map((categoryItem, catIdx) => {
      const categoryKey = getCategoryKey(categoryItem.id, categoryItem.name);
      const isExpanded = expandedCategories.has(categoryKey);
      const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
      const group = emailCategoryMap.get(categoryKey);
      const categoryEmails = group?.emails ?? [];

      // Hide category once loaded with no remaining emails (all archived locally).
      // We intentionally do not require categoryItem.count === 0 here because that
      // reflects the server summary which may lag behind local optimistic archive state.
      if (isLoaded && categoryEmails.length === 0) {
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
        />
      );
    })}
  </>
);

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
  onUnlockPriorityTier?: (newMinPriority: number) => void;
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
    mode, onToggleCategory, onBulkArchive, onConvertProtoCategory, onDeleteProtoCategoryFromInbox,
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
