import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PatternTagInput } from 'components/settings/workflows/PatternTagInput';

import { ArchiveRuleKeywords } from './autoArchiveProposals.api';
import { ProposalImpact } from './ProposalImpact';
import { useProposalPreview } from './useProposalPreview';

interface ProposalKeywordEditorProps {
  proposalId: string;
  keywords: ArchiveRuleKeywords;
  windowDays: number;
  onChange: (keywords: ArchiveRuleKeywords) => void;
}

type KeywordField = keyof ArchiveRuleKeywords;

/**
 * Edits a proposal's keywords and re-checks the edited rule against the
 * user's history as they type, so a broadened rule that would have hidden mail
 * they read shows up before they approve it.
 */
export const ProposalKeywordEditor: React.FC<ProposalKeywordEditorProps> = ({
  proposalId,
  keywords,
  windowDays,
  onChange,
}) => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<Record<KeywordField, string>>({ subjectPatterns: '', bodyPatterns: '' });
  const { preview, isLoading, hasError } = useProposalPreview(proposalId, keywords);

  const add = (field: KeywordField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onChange({ ...keywords, [field]: [...keywords[field], trimmed] });
    setInputs(current => ({ ...current, [field]: '' }));
  };

  const remove = (field: KeywordField, index: number) =>
    onChange({ ...keywords, [field]: keywords[field].filter((_, position) => position !== index) });

  const fieldEditor = (field: KeywordField, labelKey: string, placeholderKey: string) => (
    <div>
      <label style={{ ...theme.typography.body.small, fontWeight: 600, display: 'block', marginBottom: 4 }}>
        {t(labelKey)}
      </label>
      <PatternTagInput
        patterns={keywords[field]}
        inputValue={inputs[field]}
        onInputChange={value => setInputs(current => ({ ...current, [field]: value }))}
        onAdd={value => add(field, value)}
        onRemove={index => remove(field, index)}
        placeholder={t(placeholderKey)}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {fieldEditor(
        'subjectPatterns',
        'settings.autoArchive.editor.subjectLabel',
        'settings.autoArchive.editor.subjectPlaceholder'
      )}
      {fieldEditor('bodyPatterns', 'settings.autoArchive.editor.bodyLabel', 'settings.autoArchive.editor.bodyPlaceholder')}
      <p style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary, margin: 0 }}>
        {t('settings.autoArchive.editor.hint')}
      </p>
      <div aria-live="polite">
        {isLoading && (
          <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, margin: 0 }}>
            {t('settings.autoArchive.editor.checking')}
          </p>
        )}
        {hasError && (
          <p style={{ ...theme.typography.body.small, color: theme.colors.error.dark, margin: 0 }}>
            {t('settings.autoArchive.editor.previewError')}
          </p>
        )}
        {preview && !isLoading && (
          <ProposalImpact stats={preview.window} windowDays={windowDays} senderTotal={preview.senderTotal} />
        )}
      </div>
    </div>
  );
};
