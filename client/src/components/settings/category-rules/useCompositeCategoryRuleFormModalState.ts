import { type Dispatch, type SetStateAction,useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import type { CategoryOption } from 'queries/useCategoryContextQuery';
import type { CompositeSpec } from 'types/category-rules.types';
import {
  specBodyNotContains,
  specSenders,
  specSubjectNotContains,
  specSubjects,
} from 'types/category-rules.types';

import type { CompositeCategoryRuleFormFieldErrors } from 'components/settings/category-rules/CompositeCategoryRuleFormFields';
import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';

function parseNonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Normalise a category name for tolerant matching: lowercase + drop a leading
 * emoji/symbol prefix, so "🎧 Media" and "Media" compare equal. */
function normaliseCategoryNameForMatch(name: string | null | undefined): string {
  if (!name) {
    return '';
  }
  return name
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

/** Best-effort id for a legacy rule that only has a category name (no id yet). */
function matchCategoryIdByName(name: string | null | undefined, options: CategoryOption[]): string {
  const target = normaliseCategoryNameForMatch(name);
  if (!target) {
    return '';
  }
  return options.find((option) => normaliseCategoryNameForMatch(option.name) === target)?.id ?? '';
}

interface SubmitCompositeModalParams {
  categoryId: string;
  categoryOptions: CategoryOption[];
  senderLines: string;
  subjectLines: string;
  bodyLines: string;
  subjectNotLines: string;
  bodyNotLines: string;
  t: TFunction;
  setFieldErrors: Dispatch<SetStateAction<CompositeCategoryRuleFormFieldErrors>>;
  setSaving: (value: boolean) => void;
  onSubmit: (payload: {
    categoryName: string;
    categoryId?: string;
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
    subjectNotContainsAny: string[];
    bodyNotContainsAny: string[];
  }) => Promise<void>;
  onClose: () => void;
}

async function submitCompositeCategoryRuleModalForm(
  params: SubmitCompositeModalParams,
): Promise<void> {
  const {
    categoryId,
    categoryOptions,
    senderLines,
    subjectLines,
    bodyLines,
    subjectNotLines,
    bodyNotLines,
    t,
    setFieldErrors,
    setSaving,
    onSubmit,
    onClose,
  } = params;

  const senders = parseNonEmptyLines(senderLines);
  const subjects = parseNonEmptyLines(subjectLines);
  const bodyPhrases = parseNonEmptyLines(bodyLines);
  const subjectNotPhrases = parseNonEmptyLines(subjectNotLines);
  const bodyNotPhrases = parseNonEmptyLines(bodyNotLines);
  const errors: CompositeCategoryRuleFormFieldErrors = {};
  // The rule links to a category by its id (contextId), chosen from the picker —
  // never a typed name, so the stored link can't be broken by emoji/renames.
  const selectedOption = categoryOptions.find((option) => option.id === categoryId);
  if (!selectedOption) {
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
  // Issue follow-up: every rule must carry at least one exclusion (subject or
  // body NOT-contains) so it cannot match too broadly and grab unrelated email.
  if (subjectNotPhrases.length === 0 && bodyNotPhrases.length === 0) {
    errors.subjectNotPhrases = t(
      'settings.deterministicCategoryRules.notContainsRequiredError',
    );
  }
  if (Object.keys(errors).length > 0 || !selectedOption) {
    setFieldErrors(errors);
    return;
  }
  setFieldErrors({});
  setSaving(true);
  try {
    await onSubmit({
      categoryName: selectedOption.name,
      categoryId: selectedOption.id,
      senderMatchesAny: senders,
      subjectContainsAny: subjects,
      bodyContainsAny: bodyPhrases,
      subjectNotContainsAny: subjectNotPhrases,
      bodyNotContainsAny: bodyNotPhrases,
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
  /** The rule's authoritative category id when editing (preselects the picker). */
  initialCategoryId?: string | null;
  categoryOptions: CategoryOption[];
  initialSpec?: CompositeSpec | null;
  /**
   * Pre-populated spec from a "Suggest for me" result (issue #1714).
   * When present, takes precedence over `initialSpec` for pre-filling the form.
   */
  initialSuggestedSpec?: {
    senderMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
    /** Issue #1789: optional pre-filled subject exclusion phrases. */
    subjectNotContainsAny?: string[];
    /** Issue #1789: optional pre-filled body exclusion phrases. */
    bodyNotContainsAny?: string[];
  } | null;
  onSubmit: SubmitCompositeModalParams['onSubmit'];
  onClose: () => void;
  t: TFunction;
}) {
  const {
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
  } = options;

  const [categoryId, setCategoryId] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [senderLines, setSenderLines] = useState('');
  const [subjectLines, setSubjectLines] = useState('');
  const [bodyLines, setBodyLines] = useState('');
  const [subjectNotLines, setSubjectNotLines] = useState('');
  const [bodyNotLines, setBodyNotLines] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CompositeCategoryRuleFormFieldErrors>(
    {},
  );

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      setHasInitialized(false);
      return;
    }
    // Initialise the form once per open session. Re-running on every dependency
    // change (e.g. a parent recreating the categoryOptions array) would wipe the
    // user's in-progress edits.
    if (hasInitialized) {
      return;
    }
    setHasInitialized(true);
    setFieldErrors({});
    // Prefer the rule's authoritative id; fall back to a tolerant name match for
    // legacy rules / suggestions that only carry a name.
    setCategoryId(initialCategoryId ?? matchCategoryIdByName(initialCategoryName, categoryOptions));
    if (initialSuggestedSpec) {
      // Pre-fill all fields from the suggestion so the user can review/edit before saving.
      setSenderLines(initialSuggestedSpec.senderMatchesAny.join('\n'));
      setSubjectLines(initialSuggestedSpec.subjectContainsAny.join('\n'));
      setBodyLines(initialSuggestedSpec.bodyContainsAny.join('\n'));
      setSubjectNotLines((initialSuggestedSpec.subjectNotContainsAny ?? []).join('\n'));
      setBodyNotLines((initialSuggestedSpec.bodyNotContainsAny ?? []).join('\n'));
    } else {
      setSenderLines(initialSpec ? specSenders(initialSpec).join('\n') : '');
      setSubjectLines(initialSpec ? specSubjects(initialSpec).join('\n') : '');
      setBodyLines((initialSpec?.bodyContainsAny ?? []).join('\n'));
      setSubjectNotLines(initialSpec ? specSubjectNotContains(initialSpec).join('\n') : '');
      setBodyNotLines(initialSpec ? specBodyNotContains(initialSpec).join('\n') : '');
    }
  }, [open, hasInitialized, initialCategoryName, initialCategoryId, categoryOptions, initialSpec, initialSuggestedSpec]);

  const handleSubmit = async () => {
    await submitCompositeCategoryRuleModalForm({
      categoryId,
      categoryOptions,
      senderLines,
      subjectLines,
      bodyLines,
      subjectNotLines,
      bodyNotLines,
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
  };
}
