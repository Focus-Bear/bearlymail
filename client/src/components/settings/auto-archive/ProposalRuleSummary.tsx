import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ArchiveRuleKeywords, AutoArchiveProposal } from './autoArchiveProposals.api';

export const SENDER_SCOPE = {
  ADDRESS: 'address',
  DOMAIN: 'domain',
} as const;

interface ProposalRuleSummaryProps {
  proposal: AutoArchiveProposal;
  keywords: ArchiveRuleKeywords;
}

const Keyword: React.FC<{ text: string }> = ({ text }) => (
  <code
    style={{
      background: theme.colors.primary.subtle,
      borderRadius: theme.borderRadius.sm,
      padding: '1px 6px',
      fontSize: 13,
      wordBreak: 'break-word',
    }}
  >
    {text}
  </code>
);

const KeywordList: React.FC<{ keywords: string[] }> = ({ keywords }) => {
  const { t } = useTranslation();
  return (
    <>
      {keywords.map((keyword, index) => (
        <React.Fragment key={keyword}>
          {index > 0 && ` ${t('settings.autoArchive.rule.or')} `}
          <Keyword text={keyword} />
        </React.Fragment>
      ))}
    </>
  );
};

/**
 * The rule in plain words: "Archive new emails from X whose subject contains
 * Y". Keywords are OR'd within a field and AND'd across fields, matching the
 * workflow engine.
 */
export const ProposalRuleSummary: React.FC<ProposalRuleSummaryProps> = ({ proposal, keywords }) => {
  const { t } = useTranslation();
  const isDomain = proposal.scope === SENDER_SCOPE.DOMAIN;
  const hasKeywords = keywords.subjectPatterns.length > 0 || keywords.bodyPatterns.length > 0;

  return (
    <div>
      <h4 style={{ ...theme.typography.heading.h6, margin: 0, wordBreak: 'break-word' }}>{proposal.senderDisplay}</h4>
      <p style={{ ...theme.typography.body.large, margin: `${theme.spacing.xs} 0 0`, lineHeight: 1.7 }}>
        {isDomain
          ? t('settings.autoArchive.rule.fromDomain', { pattern: proposal.condition.senderPattern })
          : t('settings.autoArchive.rule.fromAddress', { pattern: proposal.condition.senderPattern })}
        {keywords.subjectPatterns.length > 0 && (
          <>
            {' '}
            {t('settings.autoArchive.rule.subjectContains')} <KeywordList keywords={keywords.subjectPatterns} />
          </>
        )}
        {keywords.subjectPatterns.length > 0 && keywords.bodyPatterns.length > 0 && ` ${t('settings.autoArchive.rule.and')}`}
        {keywords.bodyPatterns.length > 0 && (
          <>
            {' '}
            {t('settings.autoArchive.rule.bodyContains')} <KeywordList keywords={keywords.bodyPatterns} />
          </>
        )}
        {!hasKeywords && ` ${t('settings.autoArchive.rule.everything')}`}
      </p>
    </div>
  );
};
