/**
 * The category header stacks the action buttons (Archive All + overflow ⋮) onto
 * a line BELOW the category name on mobile, so the name is no longer truncated
 * by the buttons. Desktop keeps the single-row layout.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { NotificationProvider } from 'contexts/NotificationContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => (opts?.category ? `${key}:${opts.category}` : key),
    i18n: { language: 'en' },
  }),
}));

const mockBreakpoints = vi.fn();
vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => mockBreakpoints(),
}));

const emails = [{ id: '1' }] as Email[];

function renderAccordion() {
  render(
    <NotificationProvider>
      <CategoryAccordion
        category="A very long category name that would be truncated"
        categoryId="cat-uuid-1"
        emails={emails}
        count={1}
        isExpanded={false}
        onToggle={vi.fn()}
        onArchiveAll={vi.fn().mockResolvedValue(undefined)}
      >
        <div />
      </CategoryAccordion>
    </NotificationProvider>
  );
}

/** The header row is the grandparent of the Archive All button (button → actions row → header). */
function getHeaderRow(): HTMLElement {
  const button = screen.getByRole('button', { name: 'inbox.category.archiveAll' });
  return button.parentElement!.parentElement!;
}

describe('CategoryAccordion — mobile header layout', () => {
  it('stacks name and actions vertically on mobile', () => {
    mockBreakpoints.mockReturnValue({ isMobile: true, isTablet: false, isDesktop: false });
    renderAccordion();
    expect(getHeaderRow().style.flexDirection).toBe('column');
  });

  it('keeps a single horizontal row on desktop', () => {
    mockBreakpoints.mockReturnValue({ isMobile: false, isTablet: false, isDesktop: true });
    renderAccordion();
    expect(getHeaderRow().style.flexDirection).toBe('row');
  });
});
