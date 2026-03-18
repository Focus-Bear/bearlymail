/**
 * Tests for InboxCategoryItem auto-collapse behaviour (Issue #805).
 *
 * When all emails in a category are archived one-by-one, the category should
 * auto-collapse instead of remaining open showing an empty state.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';

import { InboxCategoryItem } from './InboxContentParts';

jest.mock('utils/posthog', () => ({ captureEvent: jest.fn() }));
jest.mock('axios');

jest.mock('components/inbox/CategoryAccordion', () => ({
  CategoryAccordion: ({ children, isExpanded, onToggle, count }: any) => (
    <div data-testid="category-accordion" data-expanded={String(isExpanded)} data-count={count}>
      <button data-testid="toggle-btn" onClick={onToggle}>toggle</button>
      {children}
    </div>
  ),
}));

jest.mock('components/inbox/ProtoCategorySubAccordion', () => ({
  ProtoCategorySubAccordion: () => null,
}));

jest.mock('components/inbox/EmailListItem', () => ({
  EmailListItem: () => null,
}));

jest.mock('components/inbox/DebugView', () => ({
  DebugView: () => null,
}));

jest.mock('components/inbox/BatchInfoBar', () => ({
  BatchInfoBar: () => null,
}));

jest.mock('components/inbox/EmailListStates', () => ({
  EmailListStates: () => null,
}));

jest.mock('components/inbox/FollowUpActions', () => ({
  FollowUpActions: () => null,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('theme/theme', () => ({ theme: { colors: { border: { light: '#ccc' } } } }));

const DEFAULT_PROPS = {
  categoryItem: { id: 'cat-1', name: 'Newsletters', count: 0 },
  categoryKey: 'cat-1',
  isExpanded: true,
  isLoaded: true,
  group: { emails: [], name: 'Newsletters' } as any,
  globalIndex: 0,
  otherProtoGroups: [],
  protoCategories: [],
  isReanalysingOther: false,
  convertingProtoCategoryId: null,
  deletingProtoCategoryId: null,
  mode: 'triage' as const,
  onToggleCategory: jest.fn(),
  onBulkArchive: undefined,
  onConvertProtoCategory: jest.fn(),
  onDeleteProtoCategoryFromInbox: jest.fn(),
  onReanalyseOther: jest.fn(),
  renderItem: () => null,
};

describe('InboxCategoryItem – auto-collapse on empty category (#805)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const emails = [{ id: 'email-1' } as any];
    const props = {
      ...DEFAULT_PROPS,
      group: { emails, name: 'Newsletters' } as any,
    };

    render(<InboxCategoryItem {...props} />);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();
  });

  it('calls onToggleCategory when emails drop from non-zero to zero (archive-one-by-one)', async () => {
    const emails = [{ id: 'email-1' } as any];
    const props = {
      ...DEFAULT_PROPS,
      group: { emails, name: 'Newsletters' } as any,
    };

    const { rerender } = render(<InboxCategoryItem {...props} />);

    // Initially has emails — no collapse
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(DEFAULT_PROPS.onToggleCategory).not.toHaveBeenCalled();

    // Last email archived — emails list now empty
    rerender(
      <InboxCategoryItem
        {...props}
        group={{ emails: [], name: 'Newsletters' } as any}
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
