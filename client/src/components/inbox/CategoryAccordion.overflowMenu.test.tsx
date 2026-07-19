/**
 * The category header's overflow (⋮) menu: the Other bucket offers Recategorise
 * (moved from its own row below the header), and real categories with a UUID
 * offer "Auto archive this category" behind a confirmation dialog that creates
 * an archive workflow.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { CATEGORY_OTHER } from 'constants/strings';
import { NotificationProvider } from 'contexts/NotificationContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => (opts?.category ? `${key}:${opts.category}` : key),
    i18n: { language: 'en' },
  }),
}));

vi.mock('utils/categoryArchiveWorkflow', () => ({
  createCategoryArchiveWorkflow: vi.fn().mockResolvedValue(undefined),
}));

import { createCategoryArchiveWorkflow } from 'utils/categoryArchiveWorkflow';

const emails = [{ id: '1' }] as Email[];

function renderAccordion(props: Partial<React.ComponentProps<typeof CategoryAccordion>> = {}) {
  render(
    <NotificationProvider>
      <CategoryAccordion
        category="Work"
        categoryId="cat-uuid-1"
        emails={emails}
        count={1}
        isExpanded={false}
        onToggle={vi.fn()}
        {...props}
      >
        <div />
      </CategoryAccordion>
    </NotificationProvider>
  );
}

const openOverflowMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'inbox.category.moreActions' }));
};

const clickMenuItem = (name: string) => {
  const item = screen.getByRole('menuitem', { name });
  fireEvent.mouseDown(item);
  fireEvent.mouseUp(item);
  fireEvent.click(item);
};

describe('CategoryAccordion — overflow menu', () => {
  it('offers Recategorise for the Other bucket and forwards the click', () => {
    const onReanalyseOther = vi.fn();
    renderAccordion({ category: CATEGORY_OTHER, categoryId: null, onReanalyseOther });

    openOverflowMenu();
    clickMenuItem('inbox.category.reanalyseCategories');

    expect(onReanalyseOther).toHaveBeenCalledTimes(1);
  });

  it('creates an auto-archive workflow after confirmation for a real category', async () => {
    renderAccordion();

    openOverflowMenu();
    clickMenuItem('inbox.category.autoArchiveMenuItem');

    // Confirmation dialog explains the workflow can be deleted later.
    expect(screen.getByText('inbox.category.autoArchiveConfirmTitle:Work')).toBeInTheDocument();
    fireEvent.click(screen.getByText('inbox.category.autoArchiveConfirmCta'));

    await waitFor(() => {
      expect(createCategoryArchiveWorkflow).toHaveBeenCalledWith(
        'cat-uuid-1',
        'settings.categoryWorkflows.autoArchiveName:Work'
      );
    });
  });

  it('does not create a workflow when the confirmation is cancelled', () => {
    renderAccordion();

    openOverflowMenu();
    clickMenuItem('inbox.category.autoArchiveMenuItem');
    fireEvent.click(screen.getByText('common.cancel'));

    expect(createCategoryArchiveWorkflow).not.toHaveBeenCalled();
    expect(screen.queryByText('inbox.category.autoArchiveConfirmTitle:Work')).not.toBeInTheDocument();
  });

  it('hides the overflow menu for legacy name-keyed groups without a category id', () => {
    renderAccordion({ categoryId: null });

    expect(screen.queryByRole('button', { name: 'inbox.category.moreActions' })).not.toBeInTheDocument();
  });
});
