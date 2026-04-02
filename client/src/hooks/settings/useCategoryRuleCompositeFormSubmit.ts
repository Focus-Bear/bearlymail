import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';
import type { CreateCompositePayload, PatchCategoryRulePayload } from 'hooks/settings/useCategoryRules';

export interface CategoryRuleFormPayload {
  categoryName: string;
  sender: string;
  subjectContains: string;
  bodyContainsAny: string[];
}

export interface UseCategoryRuleCompositeFormSubmitParams {
  modalMode: typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT;
  editingRule: CategoryRuleDto | null;
  createCompositeRule: (payload: CreateCompositePayload) => Promise<void>;
  patchRule: (id: string, payload: PatchCategoryRulePayload) => Promise<void>;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export function useCategoryRuleCompositeFormSubmit({
  modalMode,
  editingRule,
  createCompositeRule,
  patchRule,
  showSuccess,
  showError,
}: UseCategoryRuleCompositeFormSubmitParams) {
  const { t } = useTranslation();

  return useCallback(
    async (payload: CategoryRuleFormPayload) => {
      if (modalMode === COMPOSITE_RULE_FORM_MODE_ADD) {
        try {
          await createCompositeRule(payload);
        } catch {
          showError(t('settings.deterministicCategoryRules.createError'));
          throw new Error('save failed');
        }
        showSuccess(t('settings.deterministicCategoryRules.createSuccess'));
        return;
      }
      if (modalMode === COMPOSITE_RULE_FORM_MODE_EDIT && editingRule) {
        const patchPayload: PatchCategoryRulePayload = {
          categoryName: payload.categoryName,
          compositeSpec: {
            sender: payload.sender,
            subjectContains: payload.subjectContains,
            bodyContainsAny: payload.bodyContainsAny,
          },
        };
        try {
          await patchRule(editingRule.id, patchPayload);
        } catch {
          showError(t('settings.deterministicCategoryRules.updateError'));
          throw new Error('save failed');
        }
        showSuccess(t('settings.deterministicCategoryRules.updateSuccess'));
        return;
      }
      showError(t('settings.deterministicCategoryRules.updateError'));
      throw new Error('save failed');
    },
    [createCompositeRule, editingRule, modalMode, patchRule, showError, showSuccess, t]
  );
}
