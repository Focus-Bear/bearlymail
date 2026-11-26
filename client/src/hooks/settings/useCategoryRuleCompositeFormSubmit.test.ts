import { renderHook } from '@testing-library/react';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';
import { useCategoryRuleCompositeFormSubmit } from 'hooks/settings/useCategoryRuleCompositeFormSubmit';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const structuralRule: CategoryRuleDto = {
  id: 'rule-1',
  categoryName: 'Human GitHub issue status updates',
  categoryId: 'cat-issues',
  ruleKind: 'composite',
  ruleType: null,
  pattern: '',
  subjectPrefix: null,
  compositeSpec: {
    v: 3,
    fromMatchesAny: ['notifications@github.com'],
    subjectContainsAny: [],
    bodyContainsAny: [],
    bodyNotContainsAny: ['Test Environment'],
    notificationSubtype: 'github:issue:closed:human',
    githubAuthorKind: 'human',
  },
  sanityCheck: null,
  isEnabled: true,
  hitCount: 35,
  createdAt: '',
  updatedAt: '',
};

describe('useCategoryRuleCompositeFormSubmit', () => {
  it('keeps the rule’s sub-stream and GitHub pins when the user edits its phrases', async () => {
    const patchRule = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCategoryRuleCompositeFormSubmit({
        modalMode: COMPOSITE_RULE_FORM_MODE_EDIT,
        editingRule: structuralRule,
        createCompositeRule: vi.fn(),
        patchRule,
        showSuccess: vi.fn(),
        showError: vi.fn(),
      })
    );

    await result.current({
      categoryName: structuralRule.categoryName,
      categoryId: 'cat-issues',
      senderMatchesAny: ['notifications@github.com'],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ['Test Environment', 'Test Objective'],
    });

    expect(patchRule).toHaveBeenCalledWith('rule-1', {
      categoryName: structuralRule.categoryName,
      categoryId: 'cat-issues',
      compositeSpec: {
        notificationSubtype: 'github:issue:closed:human',
        githubAuthorKind: 'human',
        senderMatchesAny: ['notifications@github.com'],
        subjectContainsAny: [],
        bodyContainsAny: [],
        subjectNotContainsAny: undefined,
        bodyNotContainsAny: ['Test Environment', 'Test Objective'],
      },
    });
  });
});
