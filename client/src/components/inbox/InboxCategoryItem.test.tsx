/**
 * Tests for InboxCategoryItem auto-collapse behaviour (Issue #805).
 *
 * When all emails in a category are archived one-by-one, the category should
 * auto-collapse instead of remaining open showing an empty state.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryGroup } from 'components/inbox/CategoryAccordion';

import { InboxCategoryItem } from './InboxContentParts';

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('axios');

vi.mock('components/inbox/CategoryAccordion', () => ({
  CategoryAccordion: ({
    children,
    isExpanded,
    onToggle,
    count,
  }: {
    children?: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    count?: number;
  }) => (
    <div data-testid="category-accordion" data-expanded={String(isExpanded)} data-count={count}>
      <button data-testid="toggle-btn" onClick={onToggle}>
        toggle
      </button>
      {children}
    </div>
  ),
}));

vi.mock('components/inbox/ProtoCategorySubAccordion', () => ({
  ProtoCategorySubAccordion: () => null,
}));

vi.mock('components/inbox/EmailListItem', () => ({
  EmailListItem: () => null,
}));

vi.mock('components/inbox/DebugView', () => ({
  DebugView: () => null,
}));

vi.mock('components/inbox/BatchInfoBar', () => ({
  BatchInfoBar: () => null,
}));

vi.mock('components/inbox/EmailListStates', () => ({
  EmailListStates: () => null,
}));

vi.mock('components/inbox/FollowUpActions', () => ({
  FollowUpActions: () => null,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-redux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-redux')>()),
  useDispatch: () => vi.fn(),
  useSelector: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin: false } }),
}));

vi.mock('theme/theme', () => ({ theme: { colors: { border: { light: '#ccc' } } } }));

const DEFAULT_PROPS = {
  categoryItem: { id: 'cat-1', name: 'Newsletters', count: 0 },
  categoryKey: 'cat-1',
  isExpanded: true,
  isLoaded: true,
  group: { emails: [], name: 'Newsletters', category: 'Newsletters', maxPriority: 0 } as CategoryGroup,
  globalIndex: 0,
  otherProtoGroups: [],
  protoCategories: [],
  isReanalysingOther: false,
  convertingProtoCategoryId: null,
  deletingProtoCategoryId: null,
  mode: 'triage' as const,
  onToggleCategory: vi.fn(),
  onBulkArchive: undefined,
  onConvertProtoCategory: vi.fn(),
  onDeleteProtoCategoryFromInbox: vi.fn(),
  onReanalyseOther: vi.fn(),
  renderItem: () => null,
};

describe('InboxCategoryItem – auto-collapse on empty category (#805)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onToggleCategory when loaded category has 0 emails and is expanded', async () => {
    render(<InboxCategoryItem {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(DEFAULT_PROPS.onToggleCategory).toHaveBeenCalledWith('cat-1');
    });
  });

  it('does NOT call onToggleCategory when category is not yet loaded', async () => {
    render(<InboxCategoryItem {...DEFAULT_PROPS} isLoaded={false} />);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();
  });

  it('does NOT call onToggleCategory when category is already collapsed', async () => {
    render(<InboxCategoryItem {...DEFAULT_PROPS} isExpanded={false} />);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();
  });

  it('does NOT call onToggleCategory when category still has emails', async () => {
    const emails: Email[] = [{ id: 'email-1' } as unknown as Email];
    const props = {
      ...DEFAULT_PROPS,
      group: { emails, name: 'Newsletters', category: 'Newsletters', maxPriority: 0 } as CategoryGroup,
    };

    render(<InboxCategoryItem {...props} />);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();
  });

  it('calls onToggleCategory when emails drop from non-zero to zero (archive-one-by-one)', async () => {
    const emails: Email[] = [{ id: 'email-1' } as unknown as Email];
    const props = {
      ...DEFAULT_PROPS,
      group: { emails, name: 'Newsletters', category: 'Newsletters', maxPriority: 0 } as CategoryGroup,
    };

    const { rerender } = render(<InboxCategoryItem {...props} />);

    // Initially has emails — no collapse
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();

    // Last email archived — emails list now empty
    rerender(
      <InboxCategoryItem
        {...props}
        group={{ emails: [], name: 'Newsletters', category: 'Newsletters', maxPriority: 0 } as CategoryGroup}
      />
    );

    await waitFor(() => {
      expect(DEFAULT_PROPS.onToggleCategory).toHaveBeenCalledWith('cat-1');
    });
  });

  it('does NOT call onToggleCategory when emails are empty but server count is non-zero (Other accordion bug)', async () => {
    render(<InboxCategoryItem {...DEFAULT_PROPS} categoryItem={{ id: 'cat-1', name: 'Other', count: 5 }} />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();
  });
});
