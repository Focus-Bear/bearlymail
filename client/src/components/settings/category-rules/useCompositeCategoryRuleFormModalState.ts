import { type Dispatch, type SetStateAction,useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import type { CompositeSpec } from 'types/category-rules.types';
import { specSenders, specSubjects } from 'types/category-rules.types';

import type { CompositeCategoryRuleFormFieldErrors } from 'components/settings/category-rules/CompositeCategoryRuleFormFields';
import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';

function parseNonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

interface SubmitCompositeModalParams {
  categoryName: string;
  senderLines: string;
  subjectLines: string;
  bodyLines: string;
  t: TFunction;
  setFieldErrors: Dispatch<SetStateAction<CompositeCategoryRuleFormFieldErrors>>;
  setSaving: (value: boolean) => void;
  onSubmit: (payload: {
    categoryName: string;
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
  }) => Promise<void>;
  onClose: () => void;
}

async function submitCompositeCategoryRuleModalForm(
  params: SubmitCompositeModalParams,
): Promise<void> {
  const {
    categoryName,
    senderLines,
    subjectLines,
    bodyLines,
    t,
    setFieldErrors,
    setSaving,
    onSubmit,
    onClose,
  } = params;

  const senders = parseNonEmptyLines(senderLines);
  const subjects = parseNonEmptyLines(subjectLines);
  const bodyPhrases = parseNonEmptyLines(bodyLines);
  const errors: CompositeCategoryRuleFormFieldErrors = {};
  if (!categoryName.trim()) {
    errors.categoryName = t('settings.deterministicCategoryRules.fieldRequiredError');
  }
  if (senders.length === 0) {
    errors.senders = t('settings.deterministicCategoryRules.fieldRequiredError');
  }
  if (subjects.length === 0) {
    errors.subjects = t('settings.deterministicCategoryRules.fieldRequiredError');
  }
  if (bodyPhrases.length === 0) {
    errors.bodyPhrases = t('settings.deterministicCategoryRules.fieldRequiredError');
  }
  if (Object.keys(errors).length > 0) {
    setFieldErrors(errors);
    return;
  }
  setFieldErrors({});
  setSaving(true);
  try {
    await onSubmit({
      categoryName: categoryName.trim(),
      senderMatchesAny: senders,
      subjectContainsAny: subjects,
      bodyContainsAny: bodyPhrases,
    });
    onClose();
  } catch {
    // Caller shows errors; keep modal open
  } finally {
    setSaving(false);
  }
}

export function useCompositeCategoryRuleFormModalState(options: {
  open: boolean;
  mode: typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT;
  initialCategoryName: string;
  initialSpec?: CompositeSpec | null;
  /**
   * Pre-populated spec from a "Suggest for me" result (issue #1714).
   * When present, takes precedence over `initialSpec` for pre-filling the form.
   */
  initialSuggestedSpec?: {
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
  } | null;
  onSubmit: SubmitCompositeModalParams['onSubmit'];
  onClose: () => void;
  t: TFunction;
}) {
  const { open, mode, initialCategoryName, initialSpec, initialSuggestedSpec, onSubmit, onClose, t } =
    options;

  const [categoryName, setCategoryName] = useState('');
  const [senderLines, setSenderLines] = useState('');
  const [subjectLines, setSubjectLines] = useState('');
  const [bodyLines, setBodyLines] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CompositeCategoryRuleFormFieldErrors>(
    {},
  );

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      return;
    }
    setFieldErrors({});
    setCategoryName(initialCategoryName);
    if (initialSuggestedSpec) {
      // Pre-fill all fields from the suggestion so the user can review/edit before saving.
      setSenderLines(initialSuggestedSpec.senderMatchesAny.join('\n'));
      setSubjectLines(initialSuggestedSpec.subjectContainsAny.join('\n'));
      setBodyLines(initialSuggestedSpec.bodyContainsAny.join('\n'));
    } else {
      setSenderLines(initialSpec ? specSenders(initialSpec).join('\n') : '');
      setSubjectLines(initialSpec ? specSubjects(initialSpec).join('\n') : '');
      setBodyLines((initialSpec?.bodyContainsAny ?? []).join('\n'));
    }
  }, [open, initialCategoryName, initialSpec, initialSuggestedSpec]);

  const handleSubmit = async () => {
    await submitCompositeCategoryRuleModalForm({
      categoryName,
      senderLines,
      subjectLines,
      bodyLines,
      t,
      setFieldErrors,
      setSaving,
      onSubmit,
      onClose,
    });
  };

  const modalTitle =
    mode === COMPOSITE_RULE_FORM_MODE_ADD
      ? t('settings.deterministicCategoryRules.addRule')
      : t('settings.deterministicCategoryRules.editRule');

  return {
    categoryName,
    setCategoryName,
    senderLines,
    setSenderLines,
    subjectLines,
    setSubjectLines,
    bodyLines,
    setBodyLines,
    saving,
    fieldErrors,
    setFieldErrors,
    handleSubmit,
    modalTitle,
  };
}
