import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

import { INBOX_FILTERS_COLLAPSE_TEST_ID, InboxFilters } from './InboxFilters';
import { PRIORITY_CHECKBOX_TEST_ID_PREFIX } from './PriorityCheckboxFilter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const breakpoints = vi.hoisted(() => ({ isMobile: false, isTablet: false, isDesktop: true }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({ useResponsiveBreakpoints: () => breakpoints }));

const CATEGORY_GROUP_NAME = 'inbox.filters.categoryGroup';
const CATEGORY = { id: 'cat-1', label: 'Newsletters' };

const usePhoneLayout = (isPhone: boolean) => {
  breakpoints.isMobile = isPhone;
  breakpoints.isDesktop = !isPhone;
};

const FILTERS = { accountIds: [], categories: [], minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null };

const renderFilters = (props: Partial<React.ComponentProps<typeof InboxFilters>> = {}) =>
  render(
    <InboxFilters
      isFilterBarVisible
      filters={FILTERS}
      connectedAccounts={[]}
      availableCategories={[]}
      loadingAccounts={false}
      loadingCategories={false}
      hasActiveFilters
      setAccountFilter={vi.fn()}
      setCategoryFilter={vi.fn()}
      onPriorityChange={vi.fn()}
      onCollapse={vi.fn()}
      {...props}
    />
  );

describe('InboxFilters', () => {
  afterEach(() => usePhoneLayout(false));

  it('collapses via the ✕ button', () => {
    const onCollapse = vi.fn();
    renderFilters({ onCollapse });
    fireEvent.click(screen.getByTestId(INBOX_FILTERS_COLLAPSE_TEST_ID));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('hands checkbox choices to the inbox page (which routes them through the distraction gate)', () => {
    const onPriorityChange = vi.fn();
    renderFilters({ onPriorityChange });
    fireEvent.click(
      screen.getByTestId(`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}veryLow`).querySelector('input') as HTMLInputElement
    );
    expect(onPriorityChange).toHaveBeenCalledWith(null, null);
  });

  describe('category card', () => {
    const queryCategoryGroup = () => screen.queryByRole('group', { name: CATEGORY_GROUP_NAME });

    it('is left out on a phone when "All" would be its only choice', () => {
      usePhoneLayout(true);
      renderFilters();
      expect(queryCategoryGroup()).toBeNull();
    });

    it('stays on a phone while a selected category is no longer listed, so it can be cleared', () => {
      usePhoneLayout(true);
      renderFilters({ filters: { ...FILTERS, categories: [CATEGORY.id] } });
      expect(queryCategoryGroup()).not.toBeNull();
    });

    it('stays on a phone while categories are loading', () => {
      usePhoneLayout(true);
      renderFilters({ loadingCategories: true });
      expect(queryCategoryGroup()).not.toBeNull();
    });

    it('shows on a phone once there are categories', () => {
      usePhoneLayout(true);
      renderFilters({ availableCategories: [CATEGORY] });
      expect(queryCategoryGroup()).not.toBeNull();
    });

    it('stays on wider screens even with no categories', () => {
      renderFilters();
      expect(queryCategoryGroup()).not.toBeNull();
    });
  });
});
