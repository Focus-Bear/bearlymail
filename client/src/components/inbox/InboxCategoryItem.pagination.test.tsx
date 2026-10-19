/**
 * Categories load one page at a time: the accordion shows the full count, offers
 * "Show more", and Archive All still covers rows that are not loaded yet.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryGroup } from 'components/inbox/CategoryAccordion';
import { CategoryPagination } from 'hooks/useCategoryPagination';

import { InboxCategoryItem } from './InboxContentParts';

const mockDispatch = vi.fn();
const pagination: CategoryPagination = {
  hasMore: true,
  remainingCount: 70,
  isLoadingMore: false,
  loadMore: vi.fn(),
  fetchUnloadedIds: vi.fn(),
};

vi.mock('hooks/useCategoryPagination', () => ({ useCategoryPagination: () => pagination }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('axios');
vi.mock('components/inbox/CategoryAccordion', () => ({
  CategoryAccordion: ({
    children,
    count,
    emails,
    category,
    onArchiveAll,
  }: {
    children?: React.ReactNode;
    count?: number;
    emails: Email[];
    category: string;
    onArchiveAll?: (category: string, emailIds: string[]) => Promise<void>;
  }) => (
    <div data-testid="category-accordion" data-count={count}>
      <button
        data-testid="archive-all"
        onClick={() =>
          onArchiveAll?.(
            category,
            emails.map(email => email.id)
          )
        }
      >
        archive all
      </button>
      {children}
    </div>
  ),
}));
vi.mock('components/inbox/ProtoCategorySubAccordion', () => ({ ProtoCategorySubAccordion: () => null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-redux', async importOriginal => ({
  ...(await importOriginal<typeof import('react-redux')>()),
  useDispatch: () => mockDispatch,
  useSelector: () => false,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ user: { isAdmin: false } }) }));

const loadedEmails = [{ id: 'loaded-1' }, { id: 'loaded-2' }] as unknown as Email[];

const renderItem = (onBulkArchive = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <InboxCategoryItem
      categoryItem={{ id: 'cat-1', name: 'Newsletters', count: 72 }}
      categoryKey="cat-1"
      isExpanded
      isLoaded
      group={{ emails: loadedEmails, category: 'cat-1', maxPriority: 0 } as CategoryGroup}
      globalIndex={0}
      otherProtoGroups={[]}
      protoCategories={[]}
      isReanalysingOther={false}
      convertingProtoCategoryId={null}
      deletingProtoCategoryId={null}
      mode="triage"
      onToggleCategory={vi.fn()}
      onBulkArchive={onBulkArchive}
      onConvertProtoCategory={vi.fn()}
      onDeleteProtoCategoryFromInbox={vi.fn()}
      onReanalyseOther={vi.fn()}
      renderItem={() => null}
    />
  );
  return onBulkArchive;
};

describe('InboxCategoryItem – paged categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pagination.hasMore = true;
  });

  it('shows the full category count rather than the loaded page', () => {
    renderItem();
    expect(screen.getByTestId('category-accordion').getAttribute('data-count')).toBe('72');
  });

  it('offers "Show more" and loads the next page on click', () => {
    renderItem();
    fireEvent.click(screen.getByTestId('category-load-more'));
    expect(pagination.loadMore).toHaveBeenCalledTimes(1);
  });

  it('hides "Show more" once every row is loaded', () => {
    pagination.hasMore = false;
    renderItem();
    expect(screen.queryByTestId('category-load-more')).toBeNull();
  });

  it('Archive All archives the unloaded rows too', async () => {
    vi.mocked(pagination.fetchUnloadedIds).mockResolvedValue(['unloaded-1']);
    const onBulkArchive = renderItem();

    fireEvent.click(screen.getByTestId('archive-all'));

    await waitFor(() => expect(onBulkArchive).toHaveBeenCalledWith(['loaded-1', 'loaded-2', 'unloaded-1']));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { categoryKey: 'cat-1', count: 1 } })
    );
  });

  it('Archive All still archives the loaded rows if fetching the rest fails', async () => {
    console.warn = vi.fn();
    vi.mocked(pagination.fetchUnloadedIds).mockRejectedValue(new Error('network'));
    const onBulkArchive = renderItem();

    fireEvent.click(screen.getByTestId('archive-all'));

    await waitFor(() => expect(onBulkArchive).toHaveBeenCalledWith(['loaded-1', 'loaded-2']));
  });
});
