import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

import { InboxHeader } from './InboxHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('components/inbox/header', () => ({
  InboxHeaderTabs: () => null,
  InboxHeaderActions: () => null,
}));
vi.mock('hooks/useResponsiveBreakpoints', () => ({ useResponsiveBreakpoints: vi.fn() }));

const mockedBreakpoints = useResponsiveBreakpoints as unknown as ReturnType<typeof vi.fn>;
const CLEAR_LABEL = 'inbox.filters.clear';

function renderHeader({ isMobile }: { isMobile: boolean }) {
  mockedBreakpoints.mockReturnValue({ isMobile, isTablet: false });
  const onClearFilters = vi.fn();
  render(
    <InboxHeader
      mode="triage"
      setMode={vi.fn()}
      loadingModeSwitch={false}
      triageTabRef={{ current: null }}
      actionTabRef={{ current: null }}
      followUpTabRef={{ current: null }}
      isFilterBarVisible={false}
      hasActiveFilters
      activeFilterCount={1}
      onToggleFilterBar={vi.fn()}
      onClearFilters={onClearFilters}
    />
  );
  return { onClearFilters };
}

describe('InboxHeader — clear filters (#442)', () => {
  it('shows the "Clear all filters" text on a wide screen', () => {
    renderHeader({ isMobile: false });

    expect(screen.getByTestId('clear-filters-button')).toHaveTextContent(CLEAR_LABEL);
  });

  it('shrinks to an × icon on a phone, still named for screen readers, so the header fits', () => {
    const { onClearFilters } = renderHeader({ isMobile: true });
    const button = screen.getByRole('button', { name: CLEAR_LABEL });

    expect(button).not.toHaveTextContent(CLEAR_LABEL);
    fireEvent.click(button);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
