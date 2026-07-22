import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryContextQuery } from 'queries/useCategoryContextQuery';
import type { CategoryRuleDto, CategoryRuleSuggestion } from 'types/category-rules.types';

import {
  COMPOSITE_RULE_FORM_MODE_ADD,
  COMPOSITE_RULE_FORM_MODE_EDIT,
  EDIT_RULE_CATEGORY_PARAM,
  EDIT_RULE_ID_PARAM,
} from 'constants/category-rules';
import { useNotifications } from 'contexts/NotificationContext';
import { useCategoryRuleCompositeFormSubmit } from 'hooks/settings/useCategoryRuleCompositeFormSubmit';
import { useCategoryRules } from 'hooks/settings/useCategoryRules';

export function useDeterministicCategoryRulesSectionState() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { rules, loading, createCompositeRule, patchRule, deleteRule, suggestRules } = useCategoryRules();
  const { data: categoryOptions = [] } = useCategoryContextQuery();

  /**
   * Category display name to pre-fill when the choice dialog was triggered
   * from a specific category row.  Using a ref avoids stale closure issues.
   */
  const pendingCategoryNameRef = useRef('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<
    typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT
  >(COMPOSITE_RULE_FORM_MODE_ADD);
  const [editingRule, setEditingRule] = useState<CategoryRuleDto | null>(null);
  const [prefillCategoryName, setPrefillCategoryName] = useState('');

  // --- "Add rule" choice dialog ---
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);

  // --- Suggest flow ---
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CategoryRuleSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  /** Pre-populated spec from a suggestion — passed into the composite form. */
  const [suggestedSpec, setSuggestedSpec] = useState<{
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
    /** Issue #1789: optional subject exclusion phrases. */
    subjectNotContainsAny?: string[];
    /** Issue #1789: optional body exclusion phrases. */
    bodyNotContainsAny?: string[];
  } | null>(null);

  /** Opens the "Add rule — how?" choice dialog (issue #1714). */
  const openAddChoice = useCallback(() => {
    pendingCategoryNameRef.current = '';
    setAddChoiceOpen(true);
  }, []);

  const closeAddChoice = useCallback(() => {
    pendingCategoryNameRef.current = '';
    setAddChoiceOpen(false);
  }, []);

  /**
   * Opens the choice dialog pre-scoped to a category (called from category
   * rows via CategoryRuleFromCategoryContext).  Whichever path the user
   * picks — manual or suggest — the category name will be pre-filled.
   */
  const openAddChoiceForCategoryDisplayName = useCallback((categoryName: string) => {
    pendingCategoryNameRef.current = categoryName;
    setAddChoiceOpen(true);
  }, []);

  /** User chose "Create manually" — open the composite form (optionally pre-filled). */
  const openAdd = useCallback(() => {
    const categoryToUse = pendingCategoryNameRef.current;
    pendingCategoryNameRef.current = '';
    setAddChoiceOpen(false);
    setPrefillCategoryName(categoryToUse);
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    setSuggestedSpec(null);
    setModalOpen(true);
  }, []);

  /** User chose "Suggest for me" — fetch suggestions, then show confirmation dialog. */
  const openSuggest = useCallback(async () => {
    const categoryToUse = pendingCategoryNameRef.current;
    pendingCategoryNameRef.current = '';
    setAddChoiceOpen(false);
    setSuggestError(null);
    setSuggestions([]);
    setSuggestDialogOpen(true);
    setSuggestLoading(true);
    try {
      const results = await suggestRules(categoryToUse || undefined);
      setSuggestions(results);
    } catch {
      setSuggestError(t('settings.deterministicCategoryRules.suggestError'));
    } finally {
      setSuggestLoading(false);
    }
  }, [suggestRules, t]);

  const closeSuggestDialog = useCallback(() => {
    setSuggestDialogOpen(false);
    setSuggestions([]);
    setSuggestError(null);
  }, []);

  /**
   * User accepted a suggestion — pre-fill the composite form so they can
   * review / edit before saving.
   */
  const acceptSuggestion = useCallback((suggestion: CategoryRuleSuggestion) => {
    setSuggestDialogOpen(false);
    setSuggestions([]);
    setPrefillCategoryName(suggestion.categoryName);
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    // Store the full suggestion for the form to pre-populate all fields.
    // We abuse prefillCategoryName for category and pass suggestion via a
    // dedicated state so CompositeCategoryRuleFormModal can receive it.
    setSuggestedSpec({
      senderMatchesAny: suggestion.suggestedSenderPatterns,
      subjectContainsAny: suggestion.suggestedSubjectPhrases,
      bodyContainsAny: suggestion.suggestedBodyPhrases,
      subjectNotContainsAny: suggestion.suggestedSubjectNotPhrases,
      bodyNotContainsAny: suggestion.suggestedBodyNotPhrases,
    });
    setModalOpen(true);
  }, []);

  const openAddWithPrefill = useCallback((categoryDisplayName: string) => {
    setPrefillCategoryName(categoryDisplayName.trim());
    setSuggestedSpec(null);
    setModalMode(COMPOSITE_RULE_FORM_MODE_ADD);
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((rule: CategoryRuleDto) => {
    setPrefillCategoryName('');
    setSuggestedSpec(null);
    setModalMode(COMPOSITE_RULE_FORM_MODE_EDIT);
    setEditingRule(rule);
    setModalOpen(true);
  }, []);

  const hasHandledOpenEditRule = useRef(false);

  useEffect(() => {
    if (loading || hasHandledOpenEditRule.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    // Issue #1789: prefer rule ID — opens the SPECIFIC rule that fired, even
    // when multiple rules share a category. Fall back to category name for
    // older deep links.
    const openEditRuleIdParam = params.get(EDIT_RULE_ID_PARAM);
    const openEditRuleParam = params.get(EDIT_RULE_CATEGORY_PARAM);
    if (!openEditRuleIdParam && !openEditRuleParam) {
      return;
    }

    hasHandledOpenEditRule.current = true;

    const matchingRule = openEditRuleIdParam
      ? rules.find(rule => rule.id === openEditRuleIdParam)
      : rules.find(rule => rule.categoryName === openEditRuleParam);
    if (matchingRule) {
      openEdit(matchingRule);
    }

    params.delete(EDIT_RULE_CATEGORY_PARAM);
    params.delete(EDIT_RULE_ID_PARAM);
    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, [loading, rules, openEdit]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingRule(null);
    setPrefillCategoryName('');
    setSuggestedSpec(null);
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
    async (id: string): Promise<void> => {
      try {
        await deleteRule(id);
        showSuccess(t('settings.deterministicCategoryRules.deleteSuccess'));
      } catch {
        showError(t('settings.deterministicCategoryRules.deleteError'));
      }
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
    prefillCategoryName,
    suggestedSpec,
    // "Add rule" choice dialog
    addChoiceOpen,
    openAddChoice,
    closeAddChoice,
    openAddChoiceForCategoryDisplayName,
    // Suggest flow
    suggestDialogOpen,
    suggestLoading,
    suggestions,
    suggestError,
    openAdd,
    openSuggest,
    closeSuggestDialog,
    acceptSuggestion,
    openAddWithPrefill,
    openEdit,
    closeModal,
    handleToggle,
    handleDelete,
    handleFormSubmit,
  };
}
