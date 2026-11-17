import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { BREAKPOINT_INBOX_HEADER_SINGLE_ROW } from 'constants/numbers';

import { InboxHeader } from './InboxHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const PHONE_WIDTH = 360;
const ORIGINAL_WIDTH = window.innerWidth;

const renderHeaderAtWidth = (width: number) => {
  window.innerWidth = width;
  render(
    <MemoryRouter>
      <InboxHeader
        mode="triage"
        setMode={vi.fn()}
        loadingModeSwitch={false}
        triageTabRef={{ current: null }}
        actionTabRef={{ current: null }}
        followUpTabRef={{ current: null }}
        tabCounts={{ triage: 0, action: 5, followUp: 0 }}
        isFilterBarVisible
        hasActiveFilters
        activeFilterCount={1}
        onToggleFilterBar={vi.fn()}
        onClearFilters={vi.fn()}
      />
    </MemoryRouter>
  );
};

/** The header's direct child that holds the mode tabs. */
const getTabsRow = () => {
  const header = screen.getByRole('banner');
  const triageTab = screen.getByText('inbox.triageTab (0)');
  return Array.from(header.children).find(child => child.contains(triageTab));
};

describe('InboxHeader', () => {
  afterEach(() => {
    window.innerWidth = ORIGINAL_WIDTH;
  });

  it('gives the tabs a row of their own when one row would not fit', () => {
    renderHeaderAtWidth(PHONE_WIDTH);
    const header = screen.getByRole('banner');
    expect(getTabsRow()).toBe(header.lastElementChild);
    expect(getTabsRow()).not.toContainElement(screen.getByTestId('filter-toggle-button'));
  });

  it('keeps tabs, filter and actions on one row when they fit', () => {
    renderHeaderAtWidth(BREAKPOINT_INBOX_HEADER_SINGLE_ROW);
    expect(getTabsRow()).toContainElement(screen.getByTestId('filter-toggle-button'));
  });

  it('uses the short Clear label on a phone', () => {
    renderHeaderAtWidth(PHONE_WIDTH);
    expect(screen.getByText('inbox.filters.clearAll')).toBeInTheDocument();
  });
});
