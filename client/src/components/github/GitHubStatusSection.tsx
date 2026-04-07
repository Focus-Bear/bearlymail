import React, { useState } from 'react';
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
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Show the section when:
  //   (a) the email text explicitly mentions "github" (keyword gate), OR
  //   (b) the server already found GitHub links — avoids false-negative when the
  //       keyword only appears in HTML content that doesn't reach the plain-text check.
  const serverFoundLinks = links.length > 0;
  if (!emailMentionsGitHub(emailSubject, emailBody, emailHtmlBody) && !serverFoundLinks) {
    return null;
  }

  if (!hasToken) {
    return <GitHubConnectionPrompt />;
  }

  if (!loading && links.length === 0) {
    return null;
  }

  const preview = loading ? 'Loading...' : `${links.length} link${links.length !== 1 ? 's' : ''}`;

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
      title="Refresh"
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
    >
      {loading ? (
        <GitHubStatusLoading />
      ) : (
        <GitHubLinksList
          links={links}
          suggestedActions={suggestedGitHubActions}
          onRefresh={onRefresh}
          email={email}
        />
      )}
    </CollapsibleSection>
  );
};
