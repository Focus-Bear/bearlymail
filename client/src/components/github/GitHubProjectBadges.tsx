import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { API_URL } from 'config/api';
import {
  COLOR_GITHUB_CLOSED_BG,
  COLOR_GITHUB_CLOSED_FG,
  COLOR_GITHUB_MERGED_BG,
  COLOR_GITHUB_MERGED_FG,
  COLOR_GITHUB_OPEN_BG,
  COLOR_GITHUB_OPEN_FG,
} from 'constants/colors';
import { EMOJI_CHECK, EMOJI_CLOCK, EMOJI_ROBOT, EMOJI_WARNING } from 'constants/emojis';
import {
  GITHUB_CHECKS_STATE_FAILING,
  GITHUB_CHECKS_STATE_PASSING,
  GITHUB_REVIEW_STATUS_APPROVED,
  GITHUB_REVIEW_STATUS_CHANGES_REQUESTED,
  GITHUB_STATUS_CLOSED,
  GITHUB_STATUS_MERGED,
  GITHUB_STATUS_OPEN,
} from 'constants/strings';

import { getBotLabel } from './githubBot';
import { type InboxCIResolved, resolveInboxCI } from './githubChecks';

interface GitHubProjectBadgesProps {
  emailId: string;
  initialLinks?: GitHubLink[];
  skipFetch?: boolean;
}

const GITHUB_TYPE_PR = 'pr';

// State colors for GitHub issues/PRs
const stateColors: Record<string, { bg: string; text: string; border: string }> = {
  [GITHUB_STATUS_OPEN]: { bg: COLOR_GITHUB_OPEN_BG, text: COLOR_GITHUB_OPEN_FG, border: COLOR_GITHUB_OPEN_FG },
  [GITHUB_STATUS_CLOSED]: { bg: COLOR_GITHUB_CLOSED_BG, text: COLOR_GITHUB_CLOSED_FG, border: COLOR_GITHUB_CLOSED_FG },
  [GITHUB_STATUS_MERGED]: { bg: COLOR_GITHUB_MERGED_BG, text: COLOR_GITHUB_MERGED_FG, border: COLOR_GITHUB_MERGED_FG },
};

const getDedupeKey = (link: GitHubLink): string => `${link.owner}/${link.repo}#${link.number}`.toLowerCase();

const getDisplayState = (link: GitHubLink): string =>
  link.status?.merged ? GITHUB_STATUS_MERGED : link.status?.state || GITHUB_STATUS_OPEN;

const GITHUB_SVG_PR_PATH =
  'M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z';
const GITHUB_SVG_ISSUE_PATHS = [
  'M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  'M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z',
];
const GITHUB_SVG_OCTOCAT_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

interface GitHubLinkBadgeProps {
  link: GitHubLink;
  stateText: string;
  reviewStatus: string | null;
  botLabel: string | null;
  approvalCount: number;
  ciSignal: InboxCIResolved | null;
  isPR: boolean;
  stateColor: { bg: string; text: string; border: string };
}

const GITHUB_SVG_PROJECT_PATH =
  'M1.75 0A1.75 1.75 0 000 1.75v12.5C0 15.216.784 16 1.75 16h12.5A1.75 1.75 0 0016 14.25V1.75A1.75 1.75 0 0014.25 0H1.75zM1.5 1.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v12.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V1.75zM11.75 3a.75.75 0 00-.75.75v7.5a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75zm-8.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0v-5.5zM8 3a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 3z';

const GitHubProjectItem: React.FC<{ project: { name: string; status?: string } }> = ({ project }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: `2px ${theme.spacing.sm}`,
      backgroundColor: theme.colors.background.default,
      borderRadius: theme.borderRadius.sm,
      border: `1px solid ${theme.colors.border.light}`,
      fontSize: theme.typography.fontSize.xs,
      color: theme.colors.text.secondary,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" d={GITHUB_SVG_PROJECT_PATH} />
    </svg>
    <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{project.name}</span>
    {project.status && (
      <span
        style={{
          padding: `1px ${theme.spacing.xs}`,
          backgroundColor: theme.colors.primary.subtle,
          borderRadius: theme.borderRadius.sm,
          color: theme.colors.primary.main,
        }}
      >
        {project.status}
      </span>
    )}
  </div>
);

const ciSignalColor = (state: InboxCIResolved['state']): string => {
  if (state === GITHUB_CHECKS_STATE_PASSING) {
    return theme.colors.accent.success;
  }
  if (state === GITHUB_CHECKS_STATE_FAILING) {
    return theme.colors.accent.warning;
  }
  return theme.colors.text.secondary;
};

const ciSignalEmoji = (state: InboxCIResolved['state']): string => {
  if (state === GITHUB_CHECKS_STATE_PASSING) {
    return EMOJI_CHECK;
  }
  if (state === GITHUB_CHECKS_STATE_FAILING) {
    return EMOJI_WARNING;
  }
  return EMOJI_CLOCK;
};

const GitHubLinkBadge: React.FC<GitHubLinkBadgeProps> = ({
  link,
  stateText,
  reviewStatus,
  botLabel,
  approvalCount,
  ciSignal,
  isPR,
  stateColor,
}) => {
  const { t } = useTranslation();
  return (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={event => event.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: `2px ${theme.spacing.sm}`,
        backgroundColor: stateColor.bg,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${stateColor.border}`,
        fontSize: theme.typography.fontSize.xs,
        color: stateColor.text,
        textDecoration: 'none',
        fontWeight: theme.typography.fontWeight.medium,
        cursor: 'pointer',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        {isPR ? (
          <path fillRule="evenodd" d={GITHUB_SVG_PR_PATH} />
        ) : (
          GITHUB_SVG_ISSUE_PATHS.map(svgPath => <path key={svgPath.slice(0, 10)} d={svgPath} />)
        )}
      </svg>
      <span>
        {link.repo}#{link.number}
      </span>
      <span style={{ opacity: 0.85 }}>{stateText}</span>
    </a>
    {reviewStatus && (
      <span
        style={{
          fontSize: '10px',
          color:
            link.status?.reviewStatus === GITHUB_REVIEW_STATUS_APPROVED
              ? theme.colors.accent.success
              : theme.colors.accent.warning,
          fontWeight: theme.typography.fontWeight.medium,
          paddingLeft: theme.spacing.sm,
        }}
      >
        {reviewStatus}
        {approvalCount > 1 ? ` (${approvalCount})` : ''}
      </span>
    )}
    {ciSignal && (
      <span
        title={ciSignal.titleText || undefined}
        style={{
          fontSize: '10px',
          color: ciSignalColor(ciSignal.state),
          fontWeight: theme.typography.fontWeight.medium,
          paddingLeft: theme.spacing.sm,
        }}
      >
        {ciSignalEmoji(ciSignal.state)} {t(ciSignal.labelKey, ciSignal.labelValues)}
      </span>
    )}
    {botLabel && (
      <span
        style={{
          fontSize: '10px',
          color: theme.colors.text.secondary,
          fontWeight: theme.typography.fontWeight.medium,
          paddingLeft: theme.spacing.sm,
        }}
      >
        {EMOJI_ROBOT} {botLabel}
      </span>
    )}
  </div>
  );
};

function useGitHubLinks(emailId: string, initialLinks: GitHubLink[] | undefined, skipFetch: boolean) {
  const [links, setLinks] = useState<GitHubLink[]>(initialLinks || []);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const hasCachedStatus = useMemo(
    () => !!(initialLinks?.length && initialLinks.some(link => link.status)),
    [initialLinks]
  );

  useEffect(() => {
    if (!emailId || fetchedRef.current === emailId) {
      return;
    }
    if (hasCachedStatus && initialLinks) {
      setLinks(initialLinks);
      return;
    }
    if (skipFetch) {
      return;
    }
    fetchedRef.current = emailId;
    setLoading(true);
    axios
      .get(`${API_URL}/github/emails/${emailId}`)
      .then(response => setLinks(response.data.links || []))
      .catch(() => {}) // Silently fail
      .finally(() => setLoading(false));
  }, [emailId, hasCachedStatus, initialLinks, skipFetch]);

  const uniqueLinks = useMemo(() => {
    const linkMap = new Map<string, GitHubLink>();
    for (const link of links) {
      const key = getDedupeKey(link);
      const existing = linkMap.get(key);
      if (!existing || (!!link.status?.reviewStatus && !existing.status?.reviewStatus)) {
        linkMap.set(key, link);
      }
    }
    return Array.from(linkMap.values());
  }, [links]);

  return { loading, uniqueLinks };
}

export const GitHubProjectBadges: React.FC<GitHubProjectBadgesProps> = ({
  emailId,
  initialLinks,
  skipFetch = false,
}) => {
  const { t } = useTranslation();
  const { loading, uniqueLinks } = useGitHubLinks(emailId, initialLinks, skipFetch);

  const getStateText = (link: GitHubLink): string => {
    const state = getDisplayState(link);
    if (state === GITHUB_STATUS_MERGED) {
      return t('github.merged', 'Merged');
    }
    if (state === GITHUB_STATUS_CLOSED) {
      return t('github.closed', 'Closed');
    }
    return t('github.open', 'Open');
  };

  const getReviewStatusText = (link: GitHubLink): string | null => {
    if (link.type !== GITHUB_TYPE_PR || !link.status?.reviewStatus) {
      return null;
    }
    if (link.status.reviewStatus === GITHUB_REVIEW_STATUS_APPROVED) {
      return t('github.approved');
    }
    if (link.status.reviewStatus === GITHUB_REVIEW_STATUS_CHANGES_REQUESTED) {
      return t('github.changesRequested');
    }
    return null;
  };

  // Don't render anything if no links
  if (uniqueLinks.length === 0 && !loading) {
    return null;
  }

  if (loading && uniqueLinks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          marginTop: theme.spacing.xs,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d={GITHUB_SVG_OCTOCAT_PATH} />
        </svg>
        <span>{t('common.loading')}...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.xs,
      }}
    >
      {/* Show GitHub links (issues/PRs) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
          alignItems: 'flex-start',
        }}
      >
        {uniqueLinks.slice(0, 2).map(link => {
          const displayState = getDisplayState(link);
          const stateColor = stateColors[displayState] || stateColors[GITHUB_STATUS_OPEN];
          return (
            <GitHubLinkBadge
              key={getDedupeKey(link)}
              link={link}
              stateColor={stateColor}
              stateText={getStateText(link)}
              reviewStatus={getReviewStatusText(link)}
              botLabel={getBotLabel(link.status?.author)}
              approvalCount={link.status?.reviewerDetail?.approvalCount ?? 0}
              ciSignal={resolveInboxCI(link.status?.checks)}
              isPR={link.type === GITHUB_TYPE_PR}
            />
          );
        })}
        {uniqueLinks.length > 2 && (
          <span
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.tertiary,
            }}
          >
            {t('github.more', { count: uniqueLinks.length - 2 })}
          </span>
        )}
      </div>

      {/* Show project info if available */}
      {uniqueLinks.some(link => link.status?.projects && link.status.projects.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center' }}>
          {uniqueLinks
            .flatMap(link => link.status?.projects || [])
            .slice(0, 2)
            .map(project => (
              <GitHubProjectItem key={`project-${project.name}`} project={project} />
            ))}
        </div>
      )}
    </div>
  );
};
