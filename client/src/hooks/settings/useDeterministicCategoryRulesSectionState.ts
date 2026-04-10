import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryContextQuery } from 'queries/useCategoryContextQuery';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';
import { useNotifications } from 'contexts/NotificationContext';
import { useCategoryRuleCompositeFormSubmit } from 'hooks/settings/useCategoryRuleCompositeFormSubmit';
import { useCategoryRules } from 'hooks/settings/useCategoryRules';

export function useDeterministicCategoryRulesSectionState() {
  const { t } = useTranslation();
  const { showSuccess, showError, showSuccessWithUndo } = useNotifications();
  const { rules, loading, createCompositeRule, patchRule, deleteRule } = useCategoryRules();
  const { data: categoryOptions = [] } = useCategoryContextQuery();

  /** IDs that have been optimistically removed from the UI pending the undo timer */
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] = useState<Set<string>>(new Set());
  /** Saved rule data keyed by id, for undo restoration */
  const deletedRuleSnapshots = useRef<Map<string, CategoryRuleDto>>(new Map());
  /** Cancel functions for in-flight undo timers */
  const undoCancels = useRef<Map<string, () => void>>(new Map());

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT>(
    COMPOSITE_RULE_FORM_MODE_ADD
  );
  const [editingRule, setEditingRule] = useState<CategoryRuleDto | null>(null);
  const [prefillCategoryName, setPrefillCategoryName] = useState('');

  const openAdd = useCallback(() => {
    setPrefillCategoryName('');
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const openAddWithPrefill = useCallback((categoryDisplayName: string) => {
    setPrefillCategoryName(categoryDisplayName.trim());
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((rule: CategoryRuleDto) => {
    setPrefillCategoryName('');
    setModalMode(COMPOSITE_RULE_FORM_MODE_EDIT);
    setEditingRule(rule);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingRule(null);
    setPrefillCategoryName('');
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
      // Cancel any existing undo for this id (unlikely but safe)
      const existingCancel = undoCancels.current.get(id);
      if (existingCancel) {
        existingCancel();
        undoCancels.current.delete(id);
      }

      // Snapshot the rule data so we can restore it on undo
      const ruleSnapshot = rules.find(rule => rule.id === id);
      if (ruleSnapshot) {
        deletedRuleSnapshots.current.set(id, ruleSnapshot);
      }

      // Optimistically hide the rule in the UI
      setOptimisticallyDeletedIds(prev => new Set([...prev, id]));

      const cancelUndo = showSuccessWithUndo(
        t('settings.deterministicCategoryRules.undoDelete'),
        // onCommit — timer expired, perform the real deletion
        () => {
          undoCancels.current.delete(id);
          deletedRuleSnapshots.current.delete(id);
          void (async () => {
            try {
              await deleteRule(id);
              // Rule is already gone from UI; nothing more to do
            } catch {
              // Restore rule in UI on API failure
              setOptimisticallyDeletedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              showError(t('settings.deterministicCategoryRules.deleteError'));
            }
          })();
        },
        // onUndo — user clicked Undo
        () => {
          undoCancels.current.delete(id);
          deletedRuleSnapshots.current.delete(id);
          setOptimisticallyDeletedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      );

      undoCancels.current.set(id, cancelUndo);
    },
    [deleteRule, rules, showError, showSuccessWithUndo, t]
  );

  const handleFormSubmit = useCategoryRuleCompositeFormSubmit({
    modalMode,
    editingRule,
    createCompositeRule,
    patchRule,
    showSuccess,
    showError,
  });

  // Filter out optimistically deleted rules so UI reflects deletion immediately
  const visibleRules = rules.filter(rule => !optimisticallyDeletedIds.has(rule.id));

  return {
    rules: visibleRules,
    loading,
    categoryOptions,
    modalOpen,
    modalMode,
    editingRule,
    prefillCategoryName,
    openAdd,
    openAddWithPrefill,
    openEdit,
    closeModal,
    handleToggle,
    handleDelete,
    handleFormSubmit,
  };
}
