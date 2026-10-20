import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ArchiveRuleKeywords, AutoArchiveProposal } from './autoArchiveProposals.api';
import { ProposalImpact } from './ProposalImpact';
import { ProposalKeywordEditor } from './ProposalKeywordEditor';
import { ProposalRuleSummary } from './ProposalRuleSummary';

interface AutoArchiveProposalCardProps {
  proposal: AutoArchiveProposal;
  onApprove: (proposal: AutoArchiveProposal, keywords?: ArchiveRuleKeywords) => Promise<void>;
  onDismiss: (proposal: AutoArchiveProposal) => Promise<void>;
}

const keywordsOf = (proposal: AutoArchiveProposal): ArchiveRuleKeywords => ({
  subjectPatterns: proposal.condition.subjectPatterns,
  bodyPatterns: proposal.condition.bodyPatterns,
});

/**
 * One suggested auto-archive rule: what it matches, the evidence behind it,
 * and the user's three choices — approve, edit the keywords, or dismiss.
 */
export const AutoArchiveProposalCard: React.FC<AutoArchiveProposalCardProps> = ({ proposal, onApprove, onDismiss }) => {
  const { t } = useTranslation();
  const [editedKeywords, setEditedKeywords] = useState<ArchiveRuleKeywords | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const { evidence } = proposal;
  const isEditing = editedKeywords !== null;

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <article
      aria-label={t('settings.autoArchive.card.ariaLabel', { sender: proposal.senderDisplay })}
      style={{
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        background: theme.colors.background.paper,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      <ProposalRuleSummary proposal={proposal} keywords={editedKeywords ?? keywordsOf(proposal)} />

      {isEditing ? (
        <ProposalKeywordEditor
          proposalId={proposal.id}
          keywords={editedKeywords}
          windowDays={evidence.windowDays}
          onChange={setEditedKeywords}
        />
      ) : (
        <>
          <ProposalImpact stats={evidence.window} windowDays={evidence.windowDays} senderTotal={evidence.senderTotal} />
          <p style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary, margin: 0 }}>
            {t('settings.autoArchive.card.holdoutNote', { count: evidence.holdout.matched })}
          </p>
          <SampleSubjects
            subjects={evidence.sampleSubjects}
            isOpen={showSamples}
            onToggle={() => setShowSamples(!showSamples)}
          />
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => run(() => onApprove(proposal, editedKeywords ?? undefined))}
          style={primaryButton}
        >
          {isEditing ? t('settings.autoArchive.card.approveEdited') : t('settings.autoArchive.card.approve')}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setEditedKeywords(isEditing ? null : keywordsOf(proposal))}
          style={secondaryButton}
        >
          {isEditing ? t('settings.autoArchive.card.cancelEdit') : t('settings.autoArchive.card.edit')}
        </button>
        <button type="button" disabled={isBusy} onClick={() => run(() => onDismiss(proposal))} style={textButton}>
          {t('settings.autoArchive.card.dismiss')}
        </button>
      </div>
    </article>
  );
};

const SampleSubjects: React.FC<{ subjects: string[]; isOpen: boolean; onToggle: () => void }> = ({
  subjects,
  isOpen,
  onToggle,
}) => {
  const { t } = useTranslation();
  if (subjects.length === 0) {
    return null;
  }
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} style={{ ...textButton, padding: 0 }}>
        {isOpen
          ? t('settings.autoArchive.card.hideSamples')
          : t('settings.autoArchive.card.showSamples', { count: subjects.length })}
      </button>
      {isOpen && (
        <ul style={{ margin: `${theme.spacing.sm} 0 0`, paddingLeft: 18 }}>
          {subjects.map(subject => (
            <li
              key={subject}
              style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, wordBreak: 'break-word' }}
            >
              {subject}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const baseButton: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  ...baseButton,
  border: 'none',
  background: theme.colors.primary.main,
  color: theme.colors.background.paper,
};

const secondaryButton: React.CSSProperties = {
  ...baseButton,
  border: `1px solid ${theme.colors.button.secondary.border}`,
  background: theme.colors.background.paper,
  color: theme.colors.button.secondary.text,
};

const textButton: React.CSSProperties = {
  ...baseButton,
  border: 'none',
  background: 'none',
  color: theme.colors.text.secondary,
  fontWeight: 500,
};
