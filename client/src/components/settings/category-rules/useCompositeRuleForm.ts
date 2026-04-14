import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompositeSpec } from 'types/category-rules.types';
import { specSenders, specSubjects } from 'types/category-rules.types';

const parseLines = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

type FieldErrors = {
  categoryName?: string;
  senders?: string;
  subjects?: string;
  bodyPhrases?: string;
};

type SubmitPayload = {
  categoryName: string;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
};

export function useCompositeRuleForm({
  open,
  initialCategoryName,
  initialSpec,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initialCategoryName: string;
  initialSpec?: CompositeSpec | null;
  onSubmit: (payload: SubmitPayload) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [categoryName, setCategoryName] = useState('');
  const [senderLines, setSenderLines] = useState('');
  const [subjectLines, setSubjectLines] = useState('');
  const [bodyLines, setBodyLines] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    setCategoryName(initialCategoryName);
    setSenderLines(initialSpec ? specSenders(initialSpec).join('\n') : '');
    setSubjectLines(initialSpec ? specSubjects(initialSpec).join('\n') : '');
    setBodyLines((initialSpec?.bodyContainsAny ?? []).join('\n'));
    setFieldErrors({});
  }, [open, initialCategoryName, initialSpec]);

  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors(prev => ({ ...prev, [field]: undefined }));

  const handleCategoryNameChange = (value: string) => {
    setCategoryName(value);
    clearError('categoryName');
  };

  const handleSenderLinesChange = (value: string) => {
    setSenderLines(value);
    clearError('senders');
  };

  const handleSubjectLinesChange = (value: string) => {
    setSubjectLines(value);
    clearError('subjects');
  };

  const handleBodyLinesChange = (value: string) => {
    setBodyLines(value);
    clearError('bodyPhrases');
  };

  const handleSubmit = async () => {
    const senders = parseLines(senderLines);
    const subjects = parseLines(subjectLines);
    const bodyPhrases = parseLines(bodyLines);
    const requiredError = t('settings.deterministicCategoryRules.fieldRequiredError');

    const errors: FieldErrors = {};
    if (!categoryName.trim()) {
      errors.categoryName = requiredError;
    }
    if (senders.length === 0) {
      errors.senders = requiredError;
    }
    if (subjects.length === 0) {
      errors.subjects = requiredError;
    }
    if (bodyPhrases.length === 0) {
      errors.bodyPhrases = requiredError;
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
  };

  return {
    categoryName,
    senderLines,
    subjectLines,
    bodyLines,
    saving,
    fieldErrors,
    handleCategoryNameChange,
    handleSenderLinesChange,
    handleSubjectLinesChange,
    handleBodyLinesChange,
    handleSubmit,
  };
}
