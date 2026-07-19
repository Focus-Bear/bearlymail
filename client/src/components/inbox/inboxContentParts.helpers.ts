/**
 * Pure helper functions extracted from InboxContentParts.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { theme } from 'theme/theme';

import { CategorySummaryItem } from 'store/slices/emailSlice';

export function computeEmailListBorderRight(
  splitView: {
    selectedEmailId: string | null | undefined;
    panelExpanded: boolean;
  },
  isMobile: boolean
): string {
  if (!isMobile && splitView.selectedEmailId && !splitView.panelExpanded) {
    return `1px solid ${theme.colors.border.light}`;
  }
  return 'none';
}

export function computeCanRenderCategories(options: {
  loading: boolean;
  isRefetchingWithoutData: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  fetchError: string | null | undefined;
  categoriesCount: number;
}): boolean {
  const { loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError, categoriesCount } =
    options;
  if (loading || isRefetchingWithoutData || !hasInitiallyLoaded) {
    return false;
  }
  if (loadingModeSwitch || fetchError || categoriesCount === 0) {
    return false;
  }
  return true;
}

/**
 * Determines whether the email list is empty for purposes of showing the empty state.
 *
 * Fix #1456 (blank screen after archive): when the last email is archived, the Redux
 * optimistic update in `decrementCategorySummaryCount` cannot immediately remove the
 * category from `categorySummary` (the animating email is still in `state.emails`).
 * This leaves `categorySummary` with a category at count=0, making this function return
 * `false` (not empty). After the exit animation completes, `removeEmail` fires but
 * `categorySummary` is not rechecked — so the category with count=0 remains, and the
 * list appears blank (no emails to render, no empty state shown).
 *
 * Fix: treat `categorySummary` as empty when ALL categories have count ≤ 0 AND
 * `emailsCount` is 0. This correctly catches the post-archive transient state.
 */
export function computeIsEmailsEmpty(
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
    // Either the summary has no categories, or all categories have count ≤ 0 (post-archive
    // optimistic state where animation is still running but list is visually empty).
    const allCategoriesEmpty = categorySummary.every(cat => cat.count <= 0);
    return (
      (categorySummary.length === 0 || (allCategoriesEmpty && emailsCount === 0)) && !loading && !loadingModeSwitch
    );
  }
  return emailsCount === 0 && !loading && !loadingModeSwitch;
}

export function computeEmailListFlex(splitView: {
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
