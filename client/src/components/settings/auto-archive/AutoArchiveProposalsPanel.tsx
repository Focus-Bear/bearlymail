import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR } from 'constants/autoArchive';
import { useNotifications } from 'contexts/NotificationContext';

import { AutoArchiveProposalCard } from './AutoArchiveProposalCard';
import { ArchiveRuleKeywords, AutoArchiveProposal } from './autoArchiveProposals.api';
import { useAutoArchiveProposals } from './useAutoArchiveProposals';

interface AutoArchiveProposalsPanelProps {
  /** Called after a proposal becomes a workflow, so the workflow list can refresh. */
  onRuleCreated?: () => void;
}

const describeKeywords = (proposal: AutoArchiveProposal, keywords?: ArchiveRuleKeywords) => {
  const chosen = keywords ?? proposal.condition;
  return [...chosen.subjectPatterns, ...chosen.bodyPatterns].join(', ');
};

/**
 * "Suggested auto-archive rules" — rules BearlyMail mined from the senders the
 * user hears from most and never opens. Nothing is archived until the user
 * approves; approving creates an ordinary workflow they can edit or delete.
 */
export const AutoArchiveProposalsPanel: React.FC<AutoArchiveProposalsPanelProps> = ({ onRuleCreated }) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { proposals, isLoading, hasLoadError, isScanQueued, approve, dismiss, scan } =
    useAutoArchiveProposals(onRuleCreated);

  const handleApprove = async (proposal: AutoArchiveProposal, keywords?: ArchiveRuleKeywords) => {
    const description = describeKeywords(proposal, keywords);
    const name = description
      ? t('settings.autoArchive.ruleName', { sender: proposal.condition.senderPattern, keywords: description })
      : t('settings.autoArchive.ruleNameSenderOnly', { sender: proposal.condition.senderPattern });
    try {
      await approve(proposal, name, keywords);
      showSuccess(t('settings.autoArchive.approved'));
    } catch {
      showError(t('settings.autoArchive.approveError'));
    }
  };

  const handleDismiss = async (proposal: AutoArchiveProposal) => {
    try {
      await dismiss(proposal);
    } catch {
      showError(t('settings.autoArchive.dismissError'));
    }
  };

  const handleScan = async () => {
    try {
      await scan();
    } catch {
      showError(t('settings.autoArchive.scanError'));
    }
  };

  return (
    <section
      id={AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR}
      aria-labelledby="auto-archive-proposals-title"
      style={{ marginBottom: theme.spacing.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <h3 id="auto-archive-proposals-title" style={{ ...theme.typography.heading.h5, margin: 0 }}>
            {t('settings.autoArchive.title')}
          </h3>
          <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, margin: '4px 0 0' }}>
            {t('settings.autoArchive.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanQueued}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 14px',
            borderRadius: 8,
            border: `1px solid ${theme.colors.border.default}`,
            background: theme.colors.background.paper,
            cursor: isScanQueued ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          {isScanQueued ? t('settings.autoArchive.scanQueued') : t('settings.autoArchive.scanNow')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
        {isLoading && <p style={{ color: theme.colors.text.secondary, margin: 0 }}>{t('settings.autoArchive.loading')}</p>}
        {!isLoading && hasLoadError && (
          <p style={{ color: theme.colors.error.dark, margin: 0 }}>{t('settings.autoArchive.loadError')}</p>
        )}
        {!isLoading && !hasLoadError && proposals.length === 0 && (
          <p style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary, margin: 0 }}>
            {t('settings.autoArchive.empty')}
          </p>
        )}
        {proposals.map(proposal => (
          <AutoArchiveProposalCard
            key={proposal.id}
            proposal={proposal}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </section>
  );
};
