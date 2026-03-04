import React, { useState } from 'react';
import { FiGithub } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import { emailMentionsGitHub } from 'utils/githubUtils';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { GitHubConnectionPrompt } from 'components/github/GitHubConnectionPrompt';
import { GitHubLinksList } from 'components/github/GitHubLinksList';
import { GitHubStatusLoading } from 'components/github/GitHubStatusLoading';
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
}

export const GitHubStatusSection: React.FC<GitHubStatusSectionProps> = ({
  links,
  loading,
  hasToken,
  onRefresh,
  emailSubject,
  emailBody,
  emailHtmlBody,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!emailMentionsGitHub(emailSubject, emailBody, emailHtmlBody)) {
    return null;
  }

  if (!hasToken) {
    return <GitHubConnectionPrompt />;
  }

  if (!loading && links.length === 0) {
    return null;
  }

  const preview = loading
    ? 'Loading...'
    : `${links.length} link${links.length !== 1 ? 's' : ''}`;

  const controls = (
    <button
      onClick={(e) => { e.stopPropagation(); onRefresh(); }}
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
        <GitHubLinksList links={links} />
      )}
    </CollapsibleSection>
  );
};
