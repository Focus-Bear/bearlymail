import { act, renderHook, waitFor } from '@testing-library/react';

import { useDeterministicCategoryRulesSectionState } from './useDeterministicCategoryRulesSectionState';

const baseRule = {
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

/** Two rules filing into the same category — a name-based lookup can only ever find the first. */
const sharedCategoryRuleA = { ...baseRule, id: 'rule-shared-a', categoryName: '🐛 Human GitHub issue status updates' };
const sharedCategoryRuleB = { ...baseRule, id: 'rule-shared-b', categoryName: '🐛 Human GitHub issue status updates' };
/** A rule whose category was renamed after the link was made. */
const renamedRule = { ...baseRule, id: 'rule-renamed', categoryName: '📅 Meeting reschedules (renamed)' };

vi.mock('hooks/settings/useCategoryRules', () => ({
  useCategoryRules: () => ({
    rules: [sharedCategoryRuleA, sharedCategoryRuleB, renamedRule],
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

const mockShowInfo = vi.fn();
const mockShowWarning = vi.fn();

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: mockShowInfo,
    showWarning: mockShowWarning,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('hooks/settings/useCategoryRuleCompositeFormSubmit', () => ({
  useCategoryRuleCompositeFormSubmit: () => vi.fn(),
}));

describe('useDeterministicCategoryRulesSectionState — rule deep links', () => {
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  const visit = (query: string) =>
    window.history.replaceState({}, '', `${window.location.pathname}${query}#category-rules`);

  afterEach(() => {
    window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}${originalHash}`);
    vi.clearAllMocks();
  });

  it('opens the rule named by openEditRuleId', async () => {
    visit(`?openEditRuleId=${renamedRule.id}`);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(result.current.modalOpen).toBe(true);
      expect(result.current.editingRule).toEqual(renamedRule);
    });
    expect(mockShowWarning).not.toHaveBeenCalled();
    expect(mockShowInfo).not.toHaveBeenCalled();
  });

  it('opens the rule by ID even when another rule now has the category name in the link', async () => {
    // Old-style link: the ID points at the rule that fired, the name at a
    // category another rule now owns. The ID must win.
    visit(`?openEditRuleId=${renamedRule.id}&openEditRule=${encodeURIComponent(sharedCategoryRuleA.categoryName)}`);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(result.current.editingRule).toEqual(renamedRule);
    });
  });

  it('opens the exact rule when several rules share a category name', async () => {
    visit(`?openEditRuleId=${sharedCategoryRuleB.id}`);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(result.current.editingRule).toEqual(sharedCategoryRuleB);
    });
  });

  it('does not open a rule picked by category name from a legacy name-only link', async () => {
    visit(`?openEditRule=${encodeURIComponent(sharedCategoryRuleA.categoryName)}`);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(mockShowInfo).toHaveBeenCalledWith('settings.deterministicCategoryRules.deepLink.pickRuleFromList');
    });
    expect(result.current.modalOpen).toBe(false);
    expect(result.current.editingRule).toBeNull();
  });

  it('does not fall back to the category name when the rule ID no longer exists', async () => {
    visit(`?openEditRuleId=deleted-rule-id&openEditRule=${encodeURIComponent(sharedCategoryRuleA.categoryName)}`);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith('settings.deterministicCategoryRules.deepLink.ruleNotFound');
    });
    expect(result.current.modalOpen).toBe(false);
    expect(result.current.editingRule).toBeNull();
  });

  it('removes both deep-link params from the URL after processing', async () => {
    visit(`?openEditRuleId=${renamedRule.id}&openEditRule=Anything`);

    renderHook(() => useDeterministicCategoryRulesSectionState());

    await waitFor(() => {
      expect(window.location.search).not.toContain('openEditRule');
    });
    expect(window.location.hash).toBe('#category-rules');
  });

  it('does nothing when no deep-link param is present', async () => {
    window.history.replaceState({}, '', window.location.pathname);

    const { result } = renderHook(() => useDeterministicCategoryRulesSectionState());

    await act(async () => {});

    expect(result.current.modalOpen).toBe(false);
    expect(result.current.editingRule).toBeNull();
    expect(mockShowInfo).not.toHaveBeenCalled();
    expect(mockShowWarning).not.toHaveBeenCalled();
  });
});
