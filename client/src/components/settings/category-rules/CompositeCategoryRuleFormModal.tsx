import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { CategoryOption } from 'queries/useCategoryContextQuery';
import { theme } from 'theme/theme';
import type { CompositeSpec } from 'types/category-rules.types';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import {
  type CompositeCategoryRuleFormFieldErrors,
  CompositeCategoryRuleFormFields,
} from 'components/settings/category-rules/CompositeCategoryRuleFormFields';
import { CompositeCategoryRuleFormFooter } from 'components/settings/category-rules/CompositeCategoryRuleFormFooter';
import { useCompositeCategoryRuleFormModalState } from 'components/settings/category-rules/useCompositeCategoryRuleFormModalState';
import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';

export interface CompositeCategoryRuleFormModalProps {
  open: boolean;
  mode: typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT;
  categoryOptions: CategoryOption[];
  initialCategoryName?: string;
  /** The rule's authoritative category id when editing (preselects the picker). */
  initialCategoryId?: string | null;
  initialSpec?: CompositeSpec | null;
  /**
   * Pre-populated spec from a "Suggest for me" result (issue #1714).
   * Takes precedence over `initialSpec` when provided.
   */
  initialSuggestedSpec?: {
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
    /** Issue #1789: optional pre-filled subject exclusions. */
    subjectNotContainsAny?: string[];
    /** Issue #1789: optional pre-filled body exclusions. */
    bodyNotContainsAny?: string[];
  } | null;
  onClose: () => void;
  onSubmit: (payload: {
    categoryName: string;
    categoryId?: string;
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
    subjectNotContainsAny: string[];
    bodyNotContainsAny: string[];
  }) => Promise<void>;
}

export const CompositeCategoryRuleFormModal: React.FC<CompositeCategoryRuleFormModalProps> = ({
  open,
  mode,
  categoryOptions,
  initialCategoryName = '',
  initialCategoryId,
  initialSpec,
  initialSuggestedSpec,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const {
    categoryId,
    setCategoryId,
    senderLines,
    setSenderLines,
    subjectLines,
    setSubjectLines,
    bodyLines,
    setBodyLines,
    subjectNotLines,
    setSubjectNotLines,
    bodyNotLines,
    setBodyNotLines,
    saving,
    fieldErrors,
    setFieldErrors,
    handleSubmit,
    modalTitle,
  } = useCompositeCategoryRuleFormModalState({
    open,
    mode,
    initialCategoryName,
    initialCategoryId,
    categoryOptions,
    initialSpec,
    initialSuggestedSpec,
    onSubmit,
    onClose,
    t,
  });

  if (!open) {
    return null;
  }

  const clearFieldError = (key: keyof CompositeCategoryRuleFormFieldErrors) => {
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10002}>
      <ModalContent>
        <ModalHeaderWithClose title={modalTitle} onClose={onClose} />
        <CompositeCategoryRuleFormFields
          categoryOptions={categoryOptions}
          categoryId={categoryId}
          senderLines={senderLines}
          subjectLines={subjectLines}
          bodyLines={bodyLines}
          subjectNotLines={subjectNotLines}
          bodyNotLines={bodyNotLines}
          onCategoryChange={(value) => {
            setCategoryId(value);
            clearFieldError('categoryName');
          }}
          onSenderLinesChange={(value) => {
            setSenderLines(value);
            clearFieldError('senders');
          }}
          onSubjectLinesChange={(value) => {
            setSubjectLines(value);
            clearFieldError('subjects');
          }}
          onBodyLinesChange={(value) => {
            setBodyLines(value);
            clearFieldError('bodyPhrases');
          }}
          onSubjectNotLinesChange={(value) => {
            setSubjectNotLines(value);
            clearFieldError('subjectNotPhrases');
          }}
          onBodyNotLinesChange={(value) => {
            setBodyNotLines(value);
            clearFieldError('bodyNotPhrases');
          }}
          errors={fieldErrors}
        />
        <div style={{ marginTop: theme.spacing.md }}>
          <CompositeCategoryRuleFormFooter saving={saving} onClose={onClose} onSave={handleSubmit} />
        </div>
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};
