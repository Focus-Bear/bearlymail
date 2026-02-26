import React, { useEffect, useState, useRef, useMemo } from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

import { API_URL } from 'config/api';

interface GitHubProjectBadgesProps {
  emailId: string;
  initialLinks?: GitHubLink[];
  skipFetch?: boolean;
}

// State colors for GitHub issues/PRs
const stateColors: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: '#dafbe1', text: '#1a7f37', border: '#1a7f37' },
  closed: { bg: '#ffebe9', text: '#cf222e', border: '#cf222e' },
  merged: { bg: '#fbefff', text: '#8250df', border: '#8250df' },
};

// Dedupe key based on owner/repo/number (most reliable identifier)
const getDedupeKey = (link: GitHubLink): string => {
  return `${link.owner}/${link.repo}#${link.number}`.toLowerCase();
};

export const GitHubProjectBadges: React.FC<GitHubProjectBadgesProps> = ({
  emailId,
  initialLinks,
  skipFetch = false,
}) => {
  const { t } = useTranslation();
  const [links, setLinks] = useState<GitHubLink[]>(initialLinks || []);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Stable check for whether we have cached links with status
  const hasCachedStatus = useMemo(() => {
    return initialLinks && initialLinks.length > 0 && initialLinks.some(link => link.status);
  }, [initialLinks]);

  useEffect(() => {
    if (!emailId) return;

    if (fetchedRef.current === emailId) return;

    if (hasCachedStatus && initialLinks) {
      setLinks(initialLinks);
      return;
    }

    if (skipFetch) return;

    fetchedRef.current = emailId;
    
    const fetchStatus = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/github/emails/${emailId}`);
        setLinks(response.data.links || []);
      } catch (err) {
        // Silently fail - don't show error for missing GitHub data
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [emailId, hasCachedStatus, initialLinks, skipFetch]);

  // Deduplicate links by owner/repo/number - keep the one with more data
  const uniqueLinks = useMemo(() => {
    const linkMap = new Map<string, GitHubLink>();
    for (const link of links) {
      const key = getDedupeKey(link);
      const existing = linkMap.get(key);
      // Add if new, or replace if current has review status and existing doesn't
      if (!existing || (!!link.status?.reviewStatus && !existing.status?.reviewStatus)) {
        linkMap.set(key, link);
      }
    }
    return Array.from(linkMap.values());
  }, [links]);

  // Get display state (merged takes precedence)
  const getDisplayState = (link: GitHubLink): string => {
    if (link.status?.merged) return 'merged';
    return link.status?.state || 'open';
  };

  // Get state text for display
  const getStateText = (link: GitHubLink): string => {
    const state = getDisplayState(link);
    if (state === 'merged') return t('github.merged', 'Merged');
    if (state === 'closed') return t('github.closed', 'Closed');
    return t('github.open', 'Open');
  };

  // Get review status text for PRs
  const getReviewStatusText = (link: GitHubLink): string | null => {
    if (link.type !== 'pr' || !link.status?.reviewStatus) return null;
    if (link.status.reviewStatus === 'approved') return t('github.approved');
    if (link.status.reviewStatus === 'changes_requested') return t('github.changesRequested');
    return null;
  };

  // Don't render anything if no links
  if (uniqueLinks.length === 0 && !loading) {
    return null;
  }

  // Show a subtle loading indicator while loading
  if (loading && uniqueLinks.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.xs,
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>{t('common.loading')}...</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    }}>
      {/* Show GitHub links (issues/PRs) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
        alignItems: 'flex-start',
      }}>
        {uniqueLinks.slice(0, 2).map((link) => {
          const displayState = getDisplayState(link);
          const stateColor = stateColors[displayState] || stateColors.open;
          const isPR = link.type === 'pr';
          const reviewStatus = getReviewStatusText(link);
          
          return (
            <div
              key={getDedupeKey(link)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '2px',
              }}
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
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
                {/* PR/Issue icon */}
                {isPR ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
                    <path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"/>
                  </svg>
                )}
                <span>{link.repo}#{link.number}</span>
                <span style={{ opacity: 0.85 }}>{getStateText(link)}</span>
              </a>
              {/* Show review status for PRs underneath the badge */}
              {reviewStatus && (
                <span style={{
                  fontSize: '10px',
                  color: link.status?.reviewStatus === 'approved' 
                    ? (theme.colors.accent.success || '#10b981')
                    : (theme.colors.accent.warning || '#f59e0b'),
                  fontWeight: theme.typography.fontWeight.medium,
                  paddingLeft: theme.spacing.sm,
                }}>
                  {reviewStatus}
                </span>
              )}
            </div>
          );
        })}
        {uniqueLinks.length > 2 && (
          <span style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}>
            {t('github.more', { count: uniqueLinks.length - 2 })}
          </span>
        )}
      </div>
      
      {/* Show project info if available */}
      {uniqueLinks.some(link => link.status?.projects && link.status.projects.length > 0) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
          alignItems: 'center',
        }}>
          {uniqueLinks
            .flatMap(link => link.status?.projects || [])
            .slice(0, 2)
            .map((project, index) => (
              <div
                key={`project-${project.name}-${index}`}
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
                {/* Project icon */}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M1.75 0A1.75 1.75 0 000 1.75v12.5C0 15.216.784 16 1.75 16h12.5A1.75 1.75 0 0016 14.25V1.75A1.75 1.75 0 0014.25 0H1.75zM1.5 1.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v12.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V1.75zM11.75 3a.75.75 0 00-.75.75v7.5a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75zm-8.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0v-5.5zM8 3a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 3z"/>
                </svg>
                <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
                  {project.name}
                </span>
                {project.status && (
                  <span style={{
                    padding: `1px ${theme.spacing.xs}`,
                    backgroundColor: theme.colors.primary.subtle,
                    borderRadius: theme.borderRadius.sm,
                    color: theme.colors.primary.main,
                  }}>
                    {project.status}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
