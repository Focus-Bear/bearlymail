import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { CategoryOption } from 'queries/useCategoryContextQuery';
import { theme } from 'theme/theme';
import type { CompositeSpecV1 } from 'types/category-rules.types';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { CompositeCategoryRuleFormFields } from 'components/settings/category-rules/CompositeCategoryRuleFormFields';
import { CompositeCategoryRuleFormFooter } from 'components/settings/category-rules/CompositeCategoryRuleFormFooter';
import { COMPOSITE_RULE_FORM_MODE_ADD, COMPOSITE_RULE_FORM_MODE_EDIT } from 'constants/category-rules';

export interface CompositeCategoryRuleFormModalProps {
  open: boolean;
  mode: typeof COMPOSITE_RULE_FORM_MODE_ADD | typeof COMPOSITE_RULE_FORM_MODE_EDIT;
  categoryOptions: CategoryOption[];
  initialCategoryName?: string;
  initialSpec?: CompositeSpecV1 | null;
  onClose: () => void;
  onSubmit: (payload: {
    categoryName: string;
    sender: string;
    subjectContains: string;
    bodyContainsAny: string[];
  }) => Promise<void>;
}

export const CompositeCategoryRuleFormModal: React.FC<CompositeCategoryRuleFormModalProps> = ({
  open,
  mode,
  categoryOptions,
  initialCategoryName = '',
  initialSpec,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [categoryName, setCategoryName] = useState('');
  const [sender, setSender] = useState('');
  const [subjectContains, setSubjectContains] = useState('');
  const [bodyLines, setBodyLines] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCategoryName(initialCategoryName);
    setSender(initialSpec?.sender ?? '');
    setSubjectContains(initialSpec?.subjectContains ?? '');
    setBodyLines((initialSpec?.bodyContainsAny ?? []).join('\n'));
  }, [open, initialCategoryName, initialSpec]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    const phrases = bodyLines
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (!categoryName.trim() || !sender.trim() || !subjectContains.trim() || phrases.length === 0) {
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        categoryName: categoryName.trim(),
        sender: sender.trim(),
        subjectContains: subjectContains.trim(),
        bodyContainsAny: phrases,
      });
      onClose();
    } catch {
      // Caller shows errors; keep modal open
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === COMPOSITE_RULE_FORM_MODE_ADD
      ? t('settings.deterministicCategoryRules.addRule')
      : t('settings.deterministicCategoryRules.editRule');

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10002}>
      <ModalContent>
        <ModalHeaderWithClose title={title} onClose={onClose} />
        <CompositeCategoryRuleFormFields
          categoryOptions={categoryOptions}
          categoryName={categoryName}
          sender={sender}
          subjectContains={subjectContains}
          bodyLines={bodyLines}
          onCategoryNameChange={setCategoryName}
          onSenderChange={setSender}
          onSubjectContainsChange={setSubjectContains}
          onBodyLinesChange={setBodyLines}
        />
        <div style={{ marginTop: theme.spacing.md }}>
          <CompositeCategoryRuleFormFooter saving={saving} onClose={onClose} onSave={handleSubmit} />
        </div>
      </ModalContent>
    </ModalBackdrop>,
    document.body
  );
};
