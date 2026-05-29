import { act, renderHook, waitFor } from '@testing-library/react';

import { useDeterministicCategoryRulesSectionState } from './useDeterministicCategoryRulesSectionState';

const mockRule = {
  id: 'rule-abc',
  categoryName: 'Human GitHub issue status updates',
  ruleKind: 'composite' as const,
  ruleType: null,
  pattern: '',
  subjectPrefix: null,
  compositeSpec: {
    v: 2 as const,
    senderMatchesAny: ['notifications@github.com'],
    subjectContainsAny: ['PR #'],
    bodyContainsAny: [],
  },
  isEnabled: true,
  hitCount: 5,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

vi.mock('hooks/settings/useCategoryRules', () => ({
  useCategoryRules: () => ({
    rules: [mockRule],
    loading: false,
    createCompositeRule: vi.fn(),
    patchRule: vi.fn(),
    deleteRule: vi.fn(),
    suggestRules: vi.fn(),
    fetchRules: vi.fn(),
  }),
}));

vi.mock('queries/useCategoryContextQuery', () => ({
  useCategoryContextQuery: () => ({ data: [] }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('hooks/settings/useCategoryRuleCompositeFormSubmit', () => ({
  useCategoryRuleCompositeFormSubmit: () => vi.fn(),
}));

describe('useDeterministicCategoryRulesSectionState — openEditRule URL param', () => {
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  afterEach(() => {
    window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}${originalHash}`);
    vi.clearAllMocks();
  });

  it('opens the edit modal for a matching rule when openEditRule param is present', async () => {
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?openEditRule=Human%20GitHub%20issue%20status%20updates#guide-our-ai`
    );

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(result.current.modalOpen).toBe(true);
      expect(result.current.editingRule).toEqual(mockRule);
    });
  });

  it('removes the openEditRule param from the URL after processing', async () => {
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?openEditRule=Human%20GitHub%20issue%20status%20updates#guide-our-ai`
    );

    renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(window.location.search).not.toContain('openEditRule');
    });
  });

  it('does not open the edit modal when no openEditRule param is present', async () => {
    window.history.replaceState({}, '', window.location.pathname);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await act(async () => {});

    expect(result.current.modalOpen).toBe(false);
    expect(result.current.editingRule).toBeNull();
  });

  it('does not open the modal when no rule matches the param value', async () => {
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?openEditRule=NonExistentCategory#guide-our-ai`
    );

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await act(async () => {});

    expect(result.current.modalOpen).toBe(false);
    expect(result.current.editingRule).toBeNull();
  });
});
