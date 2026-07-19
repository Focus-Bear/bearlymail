import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { GitHubAssignees } from 'components/github/GitHubAssignees';
import { GitHubLabels } from 'components/github/GitHubLabels';
import { GitHubLinkCardNoStatus } from 'components/github/GitHubLinkCardNoStatus';
import { GitHubLinkHeader } from 'components/github/GitHubLinkHeader';
import { GitHubProject } from 'components/github/GitHubProject';
import { GitHubPRStatusBadges } from 'components/github/GitHubPRStatusBadges';
import { GitHubAddCommentModal } from 'components/quick-actions/modals/GitHubAddCommentModal';
import { GitHubCreateIssueModal } from 'components/quick-actions/modals/GitHubCreateIssueModal';
import { GitHubSearchIssuesModal } from 'components/quick-actions/modals/GitHubSearchIssuesModal';
import { GitHubUpdateStatusModal } from 'components/quick-actions/modals/GitHubUpdateStatusModal';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import {
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
} from 'constants/strings';
import { GITHUB_STATE_OPEN, GITHUB_STATUS_MERGED, LINK_TYPE_ISSUE } from 'constants/strings';

const ACTION_LABELS: Record<string, string> = {
  [ACTION_TYPE_GITHUB_CREATE_ISSUE]: '✏️ Create Issue',
  [ACTION_TYPE_GITHUB_SEARCH_ISSUES]: '🔍 Search Issues',
};

interface GitHubLinkCardProps {
  link: GitHubLink;
  /** GitHub-related suggested actions relevant to this specific link (or repo). */
  suggestedActions?: SuggestedAction[];
  /** Called after a modal action succeeds so the parent can refresh GitHub data. */
  onRefresh?: () => void;
  /** Email context for modals that need it (add comment, create issue). */
  email?: { subject?: string; body?: string; from?: string; fromName?: string } | null;
}

export const GitHubLinkCard: React.FC<GitHubLinkCardProps> = ({ link, suggestedActions = [], onRefresh, email }) => {
  // Normalize legacy `project` field (string) from older database records to the new
  // `projects` array format. Old records stored a single project name as a plain string;
  // new records use an array of { name, status } objects.
  const rawStatus = link.status;
  const status = (() => {
    if (!rawStatus) {
      return rawStatus;
    }
    const legacyProject = (rawStatus as typeof rawStatus & { project?: string }).project;
    if (legacyProject && !rawStatus.projects?.length) {
      return { ...rawStatus, projects: [{ name: legacyProject }] };
    }
    return rawStatus;
  })();
  const [activeAction, setActiveAction] = useState<SuggestedAction | null>(null);

  const issueInfo = { owner: link.owner, repo: link.repo, number: link.number };

  const handleActionSuccess = () => {
    setActiveAction(null);
    onRefresh?.();
  };

  // Filter out update-status and add-comment — these are now accessible via
  // the pencil and comment icons inline in GitHubProject (see #1067).
  const visibleActions = suggestedActions.filter(
    action => action.type !== ACTION_TYPE_GITHUB_UPDATE_STATUS && action.type !== ACTION_TYPE_GITHUB_ADD_COMMENT
  );

  const actionButtons = visibleActions.length > 0 && (
    <div
      style={{
        marginTop: theme.spacing.sm,
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
      }}
    >
      {visibleActions.map(action => (
        <button
          key={`${action.type}-${action.reason}`}
          onClick={() => setActiveAction(action)}
          title={action.reason}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
            backgroundColor: theme.colors.primary.light,
            color: theme.colors.primary.dark ?? theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {ACTION_LABELS[action.type] ?? action.type}
        </button>
      ))}
    </div>
  );

  if (!status) {
    return (
      <>
        <GitHubLinkCardNoStatus link={link} />
        {actionButtons}
        {activeAction &&
          renderModal({
            action: activeAction,
            issueInfo,
            email,
            onClose: setActiveAction,
            onSuccess: handleActionSuccess,
            projectName: undefined,
          })}
      </>
    );
  }

  const isIssue = link.type === LINK_TYPE_ISSUE;
  const isOpen = status.state === GITHUB_STATE_OPEN;
  const isMerged = status.merged || status.state === GITHUB_STATUS_MERGED;

  // If this issue is linked to a GitHub Project, pass the project name so the
  // status modal uses the project-column path (typeahead with real statuses)
  // rather than the generic open/closed path.
  const linkedProjectName = status.projects && status.projects.length > 0 ? status.projects[0].name : undefined;

  return (
    <>
      <div
        style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <GitHubLinkHeader link={link} status={status} isIssue={isIssue} isOpen={isOpen} isMerged={isMerged} />
        {!isIssue && (
          <GitHubPRStatusBadges
            reviewStatus={status.reviewStatus}
            reviewerDetail={status.reviewerDetail}
            checks={status.checks}
            commentsCount={status.commentsCount}
            mergeable={status.mergeable}
            author={status.author}
          />
        )}
        <GitHubLabels labels={status.labels || []} />
        <GitHubAssignees assignees={status.assignees || []} />
        <GitHubProject projects={status.projects} issueInfo={issueInfo} onRefresh={onRefresh} emailBody={email?.body} />
        {actionButtons}
      </div>

      {activeAction &&
        renderModal({
          action: activeAction,
          issueInfo,
          email,
          onClose: setActiveAction,
          onSuccess: handleActionSuccess,
          projectName: linkedProjectName,
        })}
    </>
  );
};

function renderModal(params: {
  action: SuggestedAction;
  issueInfo: { owner: string; repo: string; number: number };
  email: { subject?: string; body?: string; from?: string; fromName?: string } | null | undefined;
  onClose: (_value: null) => void;
  onSuccess: () => void;
  /** Project name to forward to GitHubUpdateStatusModal when the issue is linked to a project. */
  projectName: string | undefined;
}): React.ReactNode {
  const { action, issueInfo, email, onClose, onSuccess, projectName } = params;
  const actionIssueInfo = (action.metadata?.issueInfo as typeof issueInfo | undefined) ?? issueInfo;

  if (action.type === ACTION_TYPE_GITHUB_UPDATE_STATUS) {
    return (
      <GitHubUpdateStatusModal
        issueInfo={actionIssueInfo}
        projectName={projectName}
        onClose={() => onClose(null)}
        onSuccess={onSuccess}
      />
    );
  }
  if (action.type === ACTION_TYPE_GITHUB_ADD_COMMENT && email?.body) {
    return (
      <GitHubAddCommentModal
        issueInfo={actionIssueInfo}
        email={{ body: email.body }}
        onClose={() => onClose(null)}
        onSuccess={onSuccess}
      />
    );
  }
  if (action.type === ACTION_TYPE_GITHUB_CREATE_ISSUE && email?.body) {
    return (
      <GitHubCreateIssueModal
        email={{
          subject: email.subject ?? '',
          body: email.body,
          from: email.from ?? '',
          fromName: email.fromName,
        }}
        defaultRepo={
          (action.metadata?.defaultRepo as { owner: string; repo: string } | undefined) ?? {
            owner: issueInfo.owner,
            repo: issueInfo.repo,
          }
        }
        onClose={() => onClose(null)}
        onSuccess={onSuccess}
      />
    );
  }
  if (action.type === ACTION_TYPE_GITHUB_SEARCH_ISSUES && email) {
    return (
      <GitHubSearchIssuesModal
        email={{ subject: email.subject ?? '', body: email.body ?? '' }}
        onClose={() => onClose(null)}
      />
    );
  }
  return null;
}
