import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Email, InboxMode } from 'types/email';

import { CATEGORY_OTHER } from 'constants/strings';
import { useProtoCategoryManagement } from 'hooks/useProtoCategoryManagement';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { buildDisplayCategories, buildEmailCategoryMap, buildOtherProtoGroups } from './inboxCategoryHelpers';
import { useInboxCategorySync } from './useInboxCategorySync';
import { useInboxScrollObserver } from './useInboxScrollObserver';
import { useInboxSplitViewHandlers } from './useInboxSplitViewHandlers';

interface UseInboxContentStateParams {
  mode: InboxMode;
  emails: Email[];
  categorySummary?: CategorySummaryItem[] | null;
  stableCategoryOrder: string[];
  expandedCategories: Set<string>;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
}

export function useInboxContentState({
  mode,
  emails,
  categorySummary,
  stableCategoryOrder,
  expandedCategories,
  onUpdateStableCategoryOrder,
  onSplitViewArchive,
  onSplitViewSnooze,
  onSplitViewPrioritySet,
  updateDraft,
  bulkSend,
  fetchThreadsWithDrafts,
  onLoadMore,
  hasMore,
}: UseInboxContentStateParams) {
  const { isMobile } = useResponsiveBreakpoints();
  const summaryLoading = useSelector(selectSummaryLoading);
  const isRefetchingWithoutData = summaryLoading && (categorySummary === null || categorySummary === undefined);
  const splitViewContainerRef = useRef<HTMLDivElement>(null);

  const {
    protoCategories, isReanalysingOther, convertingProtoCategoryId, deletingProtoCategoryId,
    fetchProtoCategories, handleReanalyseOther, handleConvertProtoCategory, handleDeleteProtoCategoryFromInbox,
  } = useProtoCategoryManagement();

  const { sentinelRef } = useInboxScrollObserver({ hasMore: hasMore ?? false, onLoadMore });

  const splitViewHandlers = useInboxSplitViewHandlers({
    mode, onSplitViewArchive, onSplitViewSnooze, onSplitViewPrioritySet,
    updateDraft, bulkSend, fetchThreadsWithDrafts,
  });

  const filteredEmails = useMemo(() => emails.filter(email => !email.isArchived), [emails]);
  const emailCategoryMap = useMemo(
    () => buildEmailCategoryMap(filteredEmails, mode, categorySummary),
    [filteredEmails, mode, categorySummary]
  );
  const otherProtoGroups = useMemo(() => buildOtherProtoGroups(emailCategoryMap), [emailCategoryMap]);

  const summaryCategories = categorySummary !== undefined ? categorySummary : null;

  useInboxCategorySync({ summaryCategories, filteredEmails, stableCategoryOrder, onUpdateStableCategoryOrder, mode });

  const displayCategories = useMemo(
    () => buildDisplayCategories(summaryCategories, filteredEmails, stableCategoryOrder, mode),
    [summaryCategories, filteredEmails, stableCategoryOrder, mode]
  );

  useEffect(() => {
    const hasOther = displayCategories.some(cat => cat.name === CATEGORY_OTHER);
    if (hasOther && expandedCategories.has(CATEGORY_OTHER)) {
      fetchProtoCategories();
    }
  }, [expandedCategories, displayCategories, fetchProtoCategories]);

  return {
    isMobile,
    isRefetchingWithoutData,
    splitViewContainerRef,
    sentinelRef,
    filteredEmails,
    emailCategoryMap,
    otherProtoGroups,
    displayCategories,
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    handleReanalyseOther,
    handleConvertProtoCategory,
    handleDeleteProtoCategoryFromInbox,
    ...splitViewHandlers,
  };
}
