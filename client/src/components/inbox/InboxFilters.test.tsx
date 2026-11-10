import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

import { INBOX_FILTERS_COLLAPSE_TEST_ID, InboxFilters } from './InboxFilters';
import { PRIORITY_CHECKBOX_TEST_ID_PREFIX } from './PriorityCheckboxFilter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
});
