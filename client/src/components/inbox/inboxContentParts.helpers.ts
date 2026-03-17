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
  isMobile: boolean,
): string {
  if (!isMobile && splitView.selectedEmailId && !splitView.panelExpanded) {
    return `1px solid ${theme.colors.border.light}`;
  }
  return 'none';
}

export function computeCanRenderCategories(
  loading: boolean,
  isRefetchingWithoutData: boolean,
  hasInitiallyLoaded: boolean,
  loadingModeSwitch: boolean,
  fetchError: string | null | undefined,
  categoriesCount: number,
): boolean {
  if (loading || isRefetchingWithoutData || !hasInitiallyLoaded) {
    return false;
  }
  if (loadingModeSwitch || fetchError || categoriesCount === 0) {
    return false;
  }
  return true;
}

export function computeIsEmailsEmpty(
  isRefetchingWithoutData: boolean,
  categorySummary: CategorySummaryItem[] | null | undefined,
  loading: boolean,
  loadingModeSwitch: boolean,
  emailsCount: number,
): boolean {
  if (isRefetchingWithoutData) {
    return false;
  }
  if (categorySummary !== null && categorySummary !== undefined) {
    return categorySummary.length === 0 && !loading && !loadingModeSwitch;
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
