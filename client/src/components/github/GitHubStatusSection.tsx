import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGithub } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { emailMentionsGitHub } from 'utils/githubUtils';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { GitHubConnectionPrompt } from 'components/github/GitHubConnectionPrompt';
import { GitHubLinksList } from 'components/github/GitHubLinksList';
import { GitHubStatusLoading } from 'components/github/GitHubStatusLoading';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { STRING_NONE } from 'constants/strings';

const GITHUB_ACCENT = '#1F2937';
const GITHUB_BG = '#F9FAFB';

interface GitHubStatusSectionProps {
  links: GitHubLink[];
  loading: boolean;
  hasToken: boolean;
  onRefresh: () => void;
  emailSubject?: string;
  emailBody?: string;
  emailHtmlBody?: string;
  /** Full email context forwarded to action modals inside link cards. */
  email?: { subject?: string; body?: string; from?: string; fromName?: string } | null;
  /** GitHub-related suggested actions to route into the matching link cards. */
  suggestedGitHubActions?: SuggestedAction[];
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

export const GitHubStatusSection: React.FC<GitHubStatusSectionProps> = ({
  links,
  loading,
  hasToken,
  onRefresh,
  emailSubject,
  emailBody,
  emailHtmlBody,
  email,
  suggestedGitHubActions = [],
  onDismiss,
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Show the section when:
  //   (a) the email text (or from address) mentions GitHub, OR
  //   (b) the server already found GitHub links — avoids false-negative when the
  //       keyword only appears in HTML content that doesn't reach the plain-text check.
  const serverFoundLinks = links.length > 0;
  if (!emailMentionsGitHub(emailSubject, emailBody, emailHtmlBody, email?.from) && !serverFoundLinks) {
    return null;
  }

  if (!hasToken) {
    return <GitHubConnectionPrompt />;
  }

  const isEmpty = !loading && links.length === 0;
  let preview: string;
  if (loading) {
    preview = t('github.refreshing');
  } else if (isEmpty) {
    preview = t('github.statusNoLinks');
  } else {
    preview = t('github.linksCount', { count: links.length });
  }

  const controls = (
    <button
      onClick={event => {
        event.stopPropagation();
        onRefresh();
      }}
      style={{
        background: 'transparent',
        border: STRING_NONE,
        color: theme.colors.text.secondary,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        padding: theme.spacing.xs,
        display: 'flex',
        alignItems: 'center',
      }}
      title={t('github.refresh')}
    >
      🔄
    </button>
  );

  return (
    <CollapsibleSection
      icon={<FiGithub size={18} />}
      title="GitHub"
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed(!isCollapsed)}
      accentColor={GITHUB_ACCENT}
      backgroundColor={GITHUB_BG}
      preview={preview}
      controls={controls}
      onDismiss={onDismiss}
      dismissTitle={t('emailDetail.hideCard')}
    >
      {loading ? (
        <GitHubStatusLoading />
      ) : isEmpty ? (
        <div
          style={{
            padding: theme.spacing.md,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <span>{t('github.statusNoLinks')}</span>
          <button
            onClick={onRefresh}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
              padding: `2px ${theme.spacing.xs}`,
            }}
          >
            {t('github.refresh')}
          </button>
        </div>
      ) : (
        <GitHubLinksList links={links} suggestedActions={suggestedGitHubActions} onRefresh={onRefresh} email={email} />
      )}
    </CollapsibleSection>
  );
};
