import React, { useMemo } from 'react';
import { Email, InboxMode } from 'types/email';

import { ResizableDivider } from 'components/inbox/ResizableDivider';
import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { useSplitView } from 'hooks/useSplitView';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { InboxEmailListPanel } from './InboxContentParts';
import { useInboxContentState } from './useInboxContentState';

export interface InboxContentProps {
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
  expandedCategories: Set<string>;
  stableCategoryOrder: string[];
  onToggleCategory: (category: string) => void;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  categorySummary?: CategorySummaryItem[] | null;
  loadedCategoryNames?: string[];
  loadingCategoryNames?: string[];
  fetchCategoryEmails?: (categoryName: string) => void;
  /** Current active priority filter for progressive unlock */
  minPriority?: number | null;
  /** Counts of threads per priority tier for progressive unlock prompt */
  priorityCounts?: { high: number; medium: number; low: number } | null;
  /** Called when user accepts progressive unlock to a lower priority tier */
  onUnlockPriorityTier?: (minPriority: number, maxPriority: number | null) => void;
  /** Called when user dismisses the progressive unlock prompt */
  onDismissUnlockPrompt?: () => void;
}

export const InboxContent: React.FC<InboxContentProps> = (props) => {
  const {
    mode, emails, loading, hasInitiallyLoaded, loadingModeSwitch, decrypting, fetchError,
    selectedEmailIndex, selectedEmailIds, triageSuggestions, followUpDataMap,
    isGeneratingDrafts, followUpsError, priorityTooltip, keyboardHint, snoozeInput,
    emailActions, modals, splitView, nextDelivery, lastUrgentCheck,
    onEmailClick, onEmailSelect, onGenerateDrafts, onRetry, updateDraft, bulkSend,
    fetchThreadsWithDrafts, emailListRef, emailDetailRef,
    onSplitViewArchive, onSplitViewSnooze, onSplitViewPrioritySet, onBulkArchive,
    expandedCategories, stableCategoryOrder, onToggleCategory, onUpdateStableCategoryOrder,
    onLoadMore, hasMore, categorySummary, loadedCategoryNames,
    minPriority, priorityCounts, onUnlockPriorityTier, onDismissUnlockPrompt,
  } = props;

  const {
    isMobile, isRefetchingWithoutData, splitViewContainerRef, sentinelRef,
    emailCategoryMap, otherProtoGroups, displayCategories,
    protoCategories, isReanalysingOther, convertingProtoCategoryId, deletingProtoCategoryId,
    handleReanalyseOther, handleConvertProtoCategory, handleDeleteProtoCategoryFromInbox,
    handleSplitViewArchive, handleSplitViewSnooze, handleSplitViewPrioritySet, handleSendFollowUp,
  } = useInboxContentState({
    mode, emails, categorySummary, stableCategoryOrder, expandedCategories,
    onUpdateStableCategoryOrder, onSplitViewArchive, onSplitViewSnooze, onSplitViewPrioritySet,
    updateDraft, bulkSend, fetchThreadsWithDrafts, onLoadMore, hasMore,
  });

  const selectedEmailForPanel = useMemo(
    () => (splitView.selectedEmailId ? emails.find(email => email.id === splitView.selectedEmailId) : undefined),
    [emails, splitView.selectedEmailId]
  );

  const listPanelProps = {
    emailListRef, sentinelRef, isMobile, splitView, mode, emails, loading,
    isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, decrypting, fetchError,
    nextDelivery, lastUrgentCheck, isGeneratingDrafts, followUpsError, categorySummary,
    displayCategories, emailCategoryMap, otherProtoGroups, protoCategories, isReanalysingOther,
    convertingProtoCategoryId, deletingProtoCategoryId, expandedCategories, loadedCategoryNames,
    hasMore, selectedEmailIds, selectedEmailIndex, triageSuggestions, followUpDataMap,
    priorityTooltip, keyboardHint, snoozeInput, emailActions, modals, updateDraft,
    onEmailClick, onEmailSelect, onSendFollowUp: handleSendFollowUp, onGenerateDrafts, onRetry,
    onToggleCategory, onBulkArchive, onConvertProtoCategory: handleConvertProtoCategory,
    onDeleteProtoCategoryFromInbox: handleDeleteProtoCategoryFromInbox,
    onReanalyseOther: handleReanalyseOther,
    minPriority, priorityCounts, onUnlockPriorityTier, onDismissUnlockPrompt,
  };

  return (
    <div ref={splitViewContainerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      <InboxEmailListPanel {...listPanelProps} />
      {!splitView.isMobile && splitView.selectedEmailId && !splitView.panelExpanded && (
        <ResizableDivider
          onResize={splitView.setSplitPosition}
          onResizeStart={splitView.startResize}
          onResizeEnd={splitView.endResize}
          position={splitView.splitPosition}
          containerRef={splitViewContainerRef}
        />
      )}
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
