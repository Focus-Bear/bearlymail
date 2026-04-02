import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryContextQuery } from 'queries/useCategoryContextQuery';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';
import { useNotifications } from 'contexts/NotificationContext';
import { useCategoryRuleCompositeFormSubmit } from 'hooks/settings/useCategoryRuleCompositeFormSubmit';
import { useCategoryRules } from 'hooks/settings/useCategoryRules';

export function useDeterministicCategoryRulesSectionState() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { rules, loading, createCompositeRule, patchRule, deleteRule } = useCategoryRules();
  const { data: categoryOptions = [] } = useCategoryContextQuery();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT>(
    COMPOSITE_RULE_FORM_MODE_ADD
  );
  const [editingRule, setEditingRule] = useState<CategoryRuleDto | null>(null);

  const openAdd = useCallback(() => {
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((rule: CategoryRuleDto) => {
    setModalMode(COMPOSITE_RULE_FORM_MODE_EDIT);
    setEditingRule(rule);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingRule(null);
  }, []);

  const handleToggle = useCallback(
    async (id: string, nextEnabled: boolean) => {
      try {
        await patchRule(id, { isEnabled: nextEnabled });
        showSuccess(t('settings.deterministicCategoryRules.toggleSuccess'));
      } catch {
        showError(t('settings.deterministicCategoryRules.toggleError'));
      }
    },
    [patchRule, showError, showSuccess, t]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm(t('settings.deterministicCategoryRules.confirmDelete'))) {
        return;
      }
      void (async () => {
        try {
          await deleteRule(id);
          showSuccess(t('settings.deterministicCategoryRules.deleteSuccess'));
        } catch {
          showError(t('settings.deterministicCategoryRules.deleteError'));
        }
      })();
    },
    [deleteRule, showError, showSuccess, t]
  );

  const handleFormSubmit = useCategoryRuleCompositeFormSubmit({
    modalMode,
    editingRule,
    createCompositeRule,
    patchRule,
    showSuccess,
    showError,
  });

  return {
    rules,
    loading,
    categoryOptions,
    modalOpen,
    modalMode,
    editingRule,
    openAdd,
    openEdit,
    closeModal,
    handleToggle,
    handleDelete,
    handleFormSubmit,
  };
}
