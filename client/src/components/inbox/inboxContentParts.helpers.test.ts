/**
 * Unit tests for InboxContentParts helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { CategorySummaryItem } from 'store/slices/emailSlice';

import {
  computeCanRenderCategories,
  computeEmailListBorderRight,
  computeEmailListFlex,
  computeIsEmailsEmpty,
} from './inboxContentParts.helpers';

describe('computeEmailListBorderRight', () => {
  it('returns border string when not mobile, email selected, and panel not expanded', () => {
    const result = computeEmailListBorderRight({ selectedEmailId: 'email-1', panelExpanded: false }, false);
    expect(result).toMatch(/^1px solid /);
  });

  it('returns "none" on mobile regardless of selection', () => {
    expect(computeEmailListBorderRight({ selectedEmailId: 'email-1', panelExpanded: false }, true)).toBe('none');
  });

  it('returns "none" when no email is selected', () => {
    expect(computeEmailListBorderRight({ selectedEmailId: null, panelExpanded: false }, false)).toBe('none');
  });

  it('returns "none" when panel is expanded', () => {
    expect(computeEmailListBorderRight({ selectedEmailId: 'email-1', panelExpanded: true }, false)).toBe('none');
  });
});

describe('computeCanRenderCategories', () => {
  const defaults = {
    loading: false,
    isRefetchingWithoutData: false,
    hasInitiallyLoaded: true,
    loadingModeSwitch: false,
    fetchError: null,
    categoriesCount: 3,
  };

  it('returns true when all conditions are clear', () => {
    const { loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError, categoriesCount } =
      defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: fetchError,
        categoriesCount: categoriesCount,
      })
    ).toBe(true);
  });

  it('returns false when loading is true', () => {
    const { isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError, categoriesCount } = defaults;
    expect(
      computeCanRenderCategories({
        loading: true,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: fetchError,
        categoriesCount: categoriesCount,
      })
    ).toBe(false);
  });

  it('returns false when isRefetchingWithoutData is true', () => {
    const { loading, hasInitiallyLoaded, loadingModeSwitch, fetchError, categoriesCount } = defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: true,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: fetchError,
        categoriesCount: categoriesCount,
      })
    ).toBe(false);
  });

  it('returns false when not yet initially loaded', () => {
    const { loading, isRefetchingWithoutData, loadingModeSwitch, fetchError, categoriesCount } = defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: false,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: fetchError,
        categoriesCount: categoriesCount,
      })
    ).toBe(false);
  });

  it('returns false when loadingModeSwitch is true', () => {
    const { loading, isRefetchingWithoutData, hasInitiallyLoaded, fetchError, categoriesCount } = defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: true,
        fetchError: fetchError,
        categoriesCount: categoriesCount,
      })
    ).toBe(false);
  });

  it('returns false when fetchError is set', () => {
    const { loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, categoriesCount } = defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: 'Network error',
        categoriesCount: categoriesCount,
      })
    ).toBe(false);
  });

  it('returns false when categoriesCount is 0', () => {
    const { loading, isRefetchingWithoutData, hasInitiallyLoaded, loadingModeSwitch, fetchError } = defaults;
    expect(
      computeCanRenderCategories({
        loading: loading,
        isRefetchingWithoutData: isRefetchingWithoutData,
        hasInitiallyLoaded: hasInitiallyLoaded,
        loadingModeSwitch: loadingModeSwitch,
        fetchError: fetchError,
        categoriesCount: 0,
      })
    ).toBe(false);
  });
});

describe('computeIsEmailsEmpty', () => {
  it('returns false when isRefetchingWithoutData is true (never show empty during refetch)', () => {
    expect(computeIsEmailsEmpty(true, [], false, false, 0)).toBe(false);
  });

  it('returns true when categorySummary is empty and not loading', () => {
    expect(computeIsEmailsEmpty(false, [], false, false, 0)).toBe(true);
  });

  it('returns false when categorySummary has items', () => {
    const summary: CategorySummaryItem[] = [{ id: 'c1', name: 'Newsletters', count: 5 }];
    expect(computeIsEmailsEmpty(false, summary, false, false, 0)).toBe(false);
  });

  it('returns false when categorySummary is empty but loading', () => {
    expect(computeIsEmailsEmpty(false, [], true, false, 0)).toBe(false);
  });

  it('returns false when categorySummary is empty but loadingModeSwitch', () => {
    expect(computeIsEmailsEmpty(false, [], false, true, 0)).toBe(false);
  });

  it('returns true when no categorySummary, emailsCount 0, not loading', () => {
    expect(computeIsEmailsEmpty(false, null, false, false, 0)).toBe(true);
  });

  it('returns false when no categorySummary, emailsCount > 0', () => {
    expect(computeIsEmailsEmpty(false, null, false, false, 5)).toBe(false);
  });

  it('returns false when no categorySummary, emailsCount 0, but loading', () => {
    expect(computeIsEmailsEmpty(false, undefined, true, false, 0)).toBe(false);
  });
});

describe('computeEmailListFlex', () => {
  it('returns 0 when panel is expanded and email is selected', () => {
    expect(computeEmailListFlex({ selectedEmailId: 'email-1', panelExpanded: true, splitPosition: 40 })).toBe(0);
  });

  it('returns flex string when email is selected and panel not expanded', () => {
    expect(computeEmailListFlex({ selectedEmailId: 'email-1', panelExpanded: false, splitPosition: 40 })).toBe(
      '0 0 40%'
    );
  });

  it('returns 1 when no email is selected', () => {
    expect(computeEmailListFlex({ selectedEmailId: null, panelExpanded: false, splitPosition: 40 })).toBe(1);
  });

  it('uses the splitPosition value in the flex string', () => {
    expect(computeEmailListFlex({ selectedEmailId: 'email-1', panelExpanded: false, splitPosition: 60 })).toBe(
      '0 0 60%'
    );
  });
});

describe('computeIsEmailsEmpty — post-archive blank screen fix (#1456)', () => {
  it('returns true when all categories have count 0 and emailsCount is 0', () => {
    // Simulates the post-archive state: optimistic update set count to 0 but
    // the animating email is still in state.emails (emailsCount may be 0 after removeEmail fires).
    const summary = [{ id: 'c1', name: 'Newsletters', count: 0 }];
    expect(computeIsEmailsEmpty(false, summary, false, false, 0)).toBe(true);
  });

  it('returns false when categories have count 0 but emailsCount > 0 (animation still running)', () => {
    // While the exit animation is running, emailsCount > 0 so we should not show empty state yet.
    const summary = [{ id: 'c1', name: 'Newsletters', count: 0 }];
    expect(computeIsEmailsEmpty(false, summary, false, false, 1)).toBe(false);
  });

  it('returns false when any category has count > 0', () => {
    const summary = [
      { id: 'c1', name: 'Newsletters', count: 0 },
      { id: 'c2', name: 'Work', count: 3 },
    ];
    expect(computeIsEmailsEmpty(false, summary, false, false, 0)).toBe(false);
  });
});
