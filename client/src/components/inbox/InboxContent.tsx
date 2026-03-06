import React from 'react';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';

import { BatchInfoBar } from 'components/inbox/BatchInfoBar';
import { CategorySection } from 'components/inbox/CategorySection';
import { DebugView } from 'components/inbox/DebugView';
import { EmailListStates } from 'components/inbox/EmailListStates';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { ResizableDivider } from 'components/inbox/ResizableDivider';
import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { MODE_FOLLOW_UP, MODE_TRIAGE, STRING_NONE } from 'constants/strings';
import { useSplitView } from 'hooks/useSplitView';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { useInboxContentData } from './useInboxContentData';

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
  onEmailClick: (emailId: string, index: number, e: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, e: React.MouseEvent) => void;
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
}


type InboxSplitView = { isMobile: boolean; selectedEmailId: string | null | undefined; panelExpanded: boolean; isResizing: boolean; splitPosition: number; };

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
  if (loading || isRefetchingWithoutData || !hasInitiallyLoaded) return false;
  if (loadingModeSwitch || fetchError || categoriesCount === 0) return false;
  return true;
}

function computeIsEmailsEmpty(
  isRefetchingWithoutData: boolean,
  categorySummary: Array<{ name: string; count: number }> | null | undefined,
  loading: boolean,
  loadingModeSwitch: boolean,
  emailsCount: number
): boolean {
  if (isRefetchingWithoutData) return false;
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

export const InboxContent: React.FC<InboxContentProps> = (props) => {
  const contentData = useInboxContentData({ mode: props.mode, emails: props.emails, categorySummary: props.categorySummary, stableCategoryOrder: props.stableCategoryOrder, expandedCategories: props.expandedCategories, onUpdateStableCategoryOrder: props.onUpdateStableCategoryOrder, onSplitViewArchive: props.onSplitViewArchive, onSplitViewSnooze: props.onSplitViewSnooze, onSplitViewPrioritySet: props.onSplitViewPrioritySet, updateDraft: props.updateDraft, bulkSend: props.bulkSend, fetchThreadsWithDrafts: props.fetchThreadsWithDrafts, onLoadMore: props.onLoadMore, hasMore: props.hasMore, loading: props.loading });
  return <InboxContentLayout {...props} contentData={contentData} />;
};

const InboxContentLayout: React.FC<InboxContentProps & { contentData: ReturnType<typeof useInboxContentData> }> = (props) => {
  const { mode, emails, loading, hasInitiallyLoaded, loadingModeSwitch, decrypting, fetchError, selectedEmailIndex, selectedEmailIds, triageSuggestions, followUpDataMap, isGeneratingDrafts, followUpsError, priorityTooltip, keyboardHint, snoozeInput, emailActions, modals, splitView, nextDelivery, lastUrgentCheck, onEmailClick, onEmailSelect, onGenerateDrafts, onRetry, updateDraft, emailListRef, emailDetailRef, onBulkArchive, expandedCategories, onToggleCategory, categorySummary, loadedCategoryNames, contentData } = props;
  const { isMobile, isRefetchingWithoutData, splitViewContainerRef, sentinelRef, displayCategories, emailCategoryMap, otherProtoGroups, handleSplitViewArchive, handleSplitViewSnooze, handleSplitViewPrioritySet, handleSendFollowUp, protoCategoryMgmt } = contentData;
  const { protoCategories, isReanalysingOther, convertingProtoCategoryId, deletingProtoCategoryId, handleReanalyseOther, handleConvertProtoCategory, handleDeleteProtoCategoryFromInbox } = protoCategoryMgmt;

  return (
    <div 
      ref={splitViewContainerRef}
      style={{ flex: 1, display: 'flex', overflow: 'hidden', }}
    >
      {/* Email List */}
      <div 
        ref={emailListRef}
        tabIndex={0}
        style={{ flex: (() => { if (splitView.panelExpanded && splitView.selectedEmailId) return 0; if (splitView.selectedEmailId) return `0 0 ${splitView.splitPosition}%`; return 1; })(), overflowY: 'auto', padding: isMobile ? `${theme.spacing.sm} ${theme.spacing.xs}` : `${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg}`, transition: splitView.isResizing ? 'none' : 'flex 0.3s ease', borderRight: computeEmailListBorderRight(splitView), }}
      >
        <div style={{ maxWidth: splitView.selectedEmailId ? '100%' : '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? theme.spacing.xs : theme.spacing.md }}>
          {mode === MODE_TRIAGE && (
            <BatchInfoBar
              nextDelivery={nextDelivery}
              lastUrgentCheck={lastUrgentCheck}
            />
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
            emailsEmpty={computeIsEmailsEmpty(isRefetchingWithoutData, categorySummary, loading, loadingModeSwitch, emails.length)}
            mode={mode}
            onRetry={onRetry}
          />
          {computeCanRenderCategories(loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError, displayCategories.length) && (
            displayCategories.map((categoryItem, catIdx) => (
              <CategorySection key={categoryItem.name} categoryItem={categoryItem} catIdx={catIdx} displayCategories={displayCategories} expandedCategories={expandedCategories} loadedCategoryNames={loadedCategoryNames} emailCategoryMap={emailCategoryMap} mode={mode} selectedEmailIds={selectedEmailIds} selectedEmailIndex={selectedEmailIndex} triageSuggestions={triageSuggestions} followUpDataMap={followUpDataMap} priorityTooltip={priorityTooltip} keyboardHint={keyboardHint} snoozeInput={snoozeInput} emailActions={emailActions} modals={modals} onEmailClick={onEmailClick} onEmailSelect={onEmailSelect} updateDraft={updateDraft} handleSendFollowUp={handleSendFollowUp} onBulkArchive={onBulkArchive} onToggleCategory={onToggleCategory} otherProtoGroups={otherProtoGroups} protoCategories={protoCategories} isReanalysingOther={isReanalysingOther} convertingProtoCategoryId={convertingProtoCategoryId} deletingProtoCategoryId={deletingProtoCategoryId} handleReanalyseOther={handleReanalyseOther} handleConvertProtoCategory={handleConvertProtoCategory} handleDeleteProtoCategoryFromInbox={handleDeleteProtoCategoryFromInbox} />
            ))
          )}
          {/* Sentinel element for infinite scroll — triggers loadMore via IntersectionObserver */}
          {computeHasInfiniteSentinel(hasMore, loading, loadingModeSwitch, hasInitiallyLoaded) && (
            <div
              ref={sentinelRef}
              style={{ height: '1px', visibility: 'hidden' }}
              aria-hidden="true"
            />
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
