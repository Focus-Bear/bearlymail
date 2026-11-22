import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

import { CATEGORY_CHECKBOX_TEST_ID_PREFIX } from './CategoryCheckboxList';
import {
  ACCOUNT_FILTER_MENU_TEST_ID,
  CATEGORY_FILTER_MENU_TEST_ID,
  INBOX_FILTERS_COLLAPSE_TEST_ID,
  InboxFilters,
  PRIORITY_FILTER_MENU_TEST_ID,
} from './InboxFilters';
import { PRIORITY_CHECKBOX_TEST_ID_PREFIX } from './PriorityCheckboxFilter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

const breakpoints = vi.hoisted(() => ({ isMobile: false, isTablet: false, isDesktop: true }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({ useResponsiveBreakpoints: () => breakpoints }));

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
    fireEvent.click(screen.getByTestId(PRIORITY_FILTER_MENU_TEST_ID));
    fireEvent.click(
      screen.getByTestId(`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}veryLow`).querySelector('input') as HTMLInputElement
    );
    expect(onPriorityChange).toHaveBeenCalledWith(null, null);
  });

  it('keeps each list out of the way until its button is pressed, and Escape puts it away again', () => {
    renderFilters();
    const trigger = screen.getByTestId(PRIORITY_FILTER_MENU_TEST_ID);
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('closes an open list when the user clicks elsewhere', () => {
    renderFilters();
    fireEvent.click(screen.getByTestId(PRIORITY_FILTER_MENU_TEST_ID));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  describe('button wording', () => {
    it('names the priority range', () => {
      renderFilters();
      expect(screen.getByTestId(PRIORITY_FILTER_MENU_TEST_ID).textContent).toContain(
        'inbox.filters.priorityAndAbove {"bucket":"inbox.filters.buckets.high"}'
      );
    });

    it('reads "all" for a priority filter that does not apply in this mode', () => {
      renderFilters({ isPriorityFilterActive: false });
      expect(screen.getByTestId(PRIORITY_FILTER_MENU_TEST_ID).textContent).toContain('inbox.filters.all');
    });

    it('names the selected category', () => {
      renderFilters({ availableCategories: [CATEGORY], filters: { ...FILTERS, categories: [CATEGORY.id] } });
      expect(screen.getByTestId(CATEGORY_FILTER_MENU_TEST_ID).textContent).toContain(CATEGORY.label);
    });
  });

  it('applies a category tick and refetches with it', () => {
    const setCategoryFilter = vi.fn();
    const onFilterChange = vi.fn();
    renderFilters({ availableCategories: [CATEGORY], setCategoryFilter, onFilterChange });
    fireEvent.click(screen.getByTestId(CATEGORY_FILTER_MENU_TEST_ID));
    fireEvent.click(
      screen.getByTestId(`${CATEGORY_CHECKBOX_TEST_ID_PREFIX}${CATEGORY.id}`).querySelector('input') as HTMLInputElement
    );
    expect(setCategoryFilter).toHaveBeenCalledWith([CATEGORY.id]);
    expect(onFilterChange).toHaveBeenCalledWith({ categories: [CATEGORY.id] });
  });

  describe('account menu', () => {
    const ACCOUNTS = [
      { id: 'acc-1', email: 'one@example.com', provider: 'gmail' as const, isPrimary: true, isActive: true },
      { id: 'acc-2', email: 'two@example.com', provider: 'gmail' as const, isPrimary: false, isActive: true },
    ];

    it('is left out when there is only one account to choose from', () => {
      renderFilters({ connectedAccounts: [ACCOUNTS[0]] });
      expect(screen.queryByTestId(ACCOUNT_FILTER_MENU_TEST_ID)).toBeNull();
    });

    it('applies an account tick and refetches with it', () => {
      const setAccountFilter = vi.fn();
      const onFilterChange = vi.fn();
      renderFilters({ connectedAccounts: ACCOUNTS, setAccountFilter, onFilterChange });
      fireEvent.click(screen.getByTestId(ACCOUNT_FILTER_MENU_TEST_ID));
      fireEvent.click(screen.getByRole('checkbox', { name: 'two@example.com (gmail)' }));
      expect(setAccountFilter).toHaveBeenCalledWith(['acc-2']);
      expect(onFilterChange).toHaveBeenCalledWith({ accountIds: ['acc-2'] });
    });
  });

  describe('category menu', () => {
    const queryCategoryGroup = () => screen.queryByTestId(CATEGORY_FILTER_MENU_TEST_ID);

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
