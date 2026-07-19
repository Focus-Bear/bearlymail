import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AddRuleChoiceDialog } from 'components/settings/category-rules/AddRuleChoiceDialog';
import { CompositeCategoryRuleFormModal } from 'components/settings/category-rules/CompositeCategoryRuleFormModal';
import { DeterministicCategoryRulesPanel } from 'components/settings/category-rules/DeterministicCategoryRulesPanel';
import { SuggestRulesDialog } from 'components/settings/category-rules/SuggestRulesDialog';
import { COLOR_WHITE } from 'constants/colors';
import { useDeterministicCategoryRulesSectionState } from 'hooks/settings/useDeterministicCategoryRulesSectionState';

export type DeterministicCategoryRulesController = ReturnType<typeof useDeterministicCategoryRulesSectionState>;

interface DeterministicCategoryRulesSectionProps {
  controller: DeterministicCategoryRulesController;
}

export const DeterministicCategoryRulesSection: React.FC<DeterministicCategoryRulesSectionProps> = ({ controller }) => {
  const { t } = useTranslation();
  const {
    rules,
    loading,
    categoryOptions,
    modalOpen,
    modalMode,
    editingRule,
    prefillCategoryName,
    suggestedSpec,
    addChoiceOpen,
    openAddChoice,
    closeAddChoice,
    suggestDialogOpen,
    suggestLoading,
    suggestions,
    suggestError,
    openAdd,
    openSuggest,
    closeSuggestDialog,
    acceptSuggestion,
    openEdit,
    openAddWithPrefill,
    closeModal,
    handleToggle,
    handleDelete,
    handleFormSubmit,
  } = controller;

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        }}
      >
        <h3 style={{ margin: 0, fontSize: theme.typography.fontSize.lg, flex: '1 1 auto' }}>
          {t('settings.deterministicCategoryRules.sectionTitle')}
        </h3>
        {/* Issue #1714: clicking "Add rule" now opens a choice dialog */}
        <button
          type="button"
          onClick={openAddChoice}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.sm,
            border: 'none',
            background: theme.colors.primary.main,
            color: COLOR_WHITE,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.deterministicCategoryRules.addRule')}
        </button>
      </div>

      {loading ? (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('common.loading')}
        </p>
      ) : (
        <DeterministicCategoryRulesPanel
          rules={rules}
          onToggleEnabled={handleToggle}
          onDelete={handleDelete}
          onEditComposite={openEdit}
          onUpgradeToComposite={rule => openAddWithPrefill(rule.categoryName)}
        />
      )}

      {/* Step 1 — Choice: manual vs. suggest */}
      <AddRuleChoiceDialog
        open={addChoiceOpen}
        onClose={closeAddChoice}
        onManual={openAdd}
        onSuggest={() => void openSuggest()}
      />

      {/* Step 2a — Suggest: loading / list of suggestions */}
      <SuggestRulesDialog
        open={suggestDialogOpen}
        loading={suggestLoading}
        suggestions={suggestions}
        error={suggestError}
        onClose={closeSuggestDialog}
        onAccept={acceptSuggestion}
      />

      {/* Step 2b — Composite form: manual or pre-filled from suggestion */}
      <CompositeCategoryRuleFormModal
        open={modalOpen}
        mode={modalMode}
        categoryOptions={categoryOptions}
        initialCategoryName={editingRule?.categoryName ?? prefillCategoryName}
        initialCategoryId={editingRule?.categoryId ?? undefined}
        initialSpec={editingRule?.compositeSpec ?? null}
        initialSuggestedSpec={suggestedSpec}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
};
