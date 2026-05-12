import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { GitHubChecksSummary, GitHubLinkAuthor, GitHubReviewerDetail } from 'types/email';

import { GitHubBotBadge } from 'components/github/GitHubBotBadge';
import { GitHubConnectForCIPrompt } from 'components/github/GitHubConnectForCIPrompt';
import { EMOJI_CHECK, EMOJI_CLOCK, EMOJI_COMMENT, EMOJI_USER, EMOJI_WARNING } from 'constants/emojis';
import {
  GITHUB_CHECKS_STATE_FAILING,
  GITHUB_CHECKS_STATE_NONE,
  GITHUB_CHECKS_STATE_PASSING,
  GITHUB_CHECKS_STATE_PENDING,
  GITHUB_REVIEW_STATUS_APPROVED,
  GITHUB_REVIEW_STATUS_CHANGES_REQUESTED,
} from 'constants/strings';
import { useGitHubConnectionStatus } from 'hooks/useGitHubConnectionStatus';

const CHIP_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.sm,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  marginRight: theme.spacing.xs,
};

const successStyle: React.CSSProperties = {
  ...CHIP_BASE,
  backgroundColor: `${theme.colors.accent.success}20`,
  color: theme.colors.accent.success,
};

const warningStyle: React.CSSProperties = {
  ...CHIP_BASE,
  backgroundColor: `${theme.colors.accent.warning}20`,
  color: theme.colors.accent.warning,
};

const neutralStyle: React.CSSProperties = {
  ...CHIP_BASE,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.secondary,
};

interface GitHubPRStatusBadgesProps {
  reviewStatus?: 'approved' | 'changes_requested' | 'pending' | null;
  reviewerDetail?: GitHubReviewerDetail;
  checks?: GitHubChecksSummary;
  commentsCount?: number;
  mergeable?: boolean | null;
  author?: GitHubLinkAuthor;
}

export const GitHubPRStatusBadges: React.FC<GitHubPRStatusBadgesProps> = ({
  reviewStatus,
  reviewerDetail,
  checks,
  commentsCount,
  mergeable,
  author,
}) => {
  const { t } = useTranslation();
  const connectionStatus = useGitHubConnectionStatus();

  const approvalCount = reviewerDetail?.approvalCount ?? 0;
  const changesRequestedCount = reviewerDetail?.changesRequestedCount ?? 0;
  const requestedReviewers = reviewerDetail?.requestedReviewers ?? [];

  const showApprovalChip = approvalCount > 0 || reviewStatus === GITHUB_REVIEW_STATUS_APPROVED;
  const showChangesChip =
    changesRequestedCount > 0 || reviewStatus === GITHUB_REVIEW_STATUS_CHANGES_REQUESTED;

  // Show the re-auth prompt only when we have no checks data AND we know
  // the user lacks the `repo` scope (so the connection-status fetch has
  // completed). Avoids flicker while the status loads.
  const showConnectForCIPrompt =
    !checks && connectionStatus !== null && connectionStatus.hasToken && !connectionStatus.hasRepoScope;

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      {checks && checks.state !== GITHUB_CHECKS_STATE_NONE && (
        <CIStatusChip checks={checks} t={t} />
      )}
      {showConnectForCIPrompt && (
        <GitHubConnectForCIPrompt hasRepoScope={connectionStatus.hasRepoScope} />
      )}
      {showApprovalChip && (
        <div style={successStyle}>
          {EMOJI_CHECK}{' '}
          {approvalCount > 0
            ? t('github.approvalsCount', { count: approvalCount })
            : t('github.approved')}
        </div>
      )}
      {showChangesChip && (
        <div style={warningStyle}>
          {EMOJI_WARNING}{' '}
          {changesRequestedCount > 0
            ? t('github.changesRequestedCount', { count: changesRequestedCount })
            : t('github.changesRequested')}
        </div>
      )}
      {requestedReviewers.length > 0 && (
        <div style={neutralStyle} title={requestedReviewers.join(', ')}>
          {EMOJI_USER} {t('github.awaitingReviewFrom', { reviewers: formatReviewers(requestedReviewers) })}
        </div>
      )}
      {commentsCount !== undefined && (
        <div style={{ ...neutralStyle, fontWeight: theme.typography.fontWeight.normal }}>
          {EMOJI_COMMENT} {t('github.comments', { count: commentsCount })}
        </div>
      )}
      {mergeable !== null && mergeable && (
        <div style={{ ...successStyle, fontWeight: theme.typography.fontWeight.medium }}>
          {EMOJI_CHECK} {t('github.readyToMerge')}
        </div>
      )}
      <GitHubBotBadge author={author} />
    </div>
  );
};

const MAX_REVIEWERS_INLINE = 2;

function formatReviewers(reviewers: string[]): string {
  if (reviewers.length <= MAX_REVIEWERS_INLINE) {
    return reviewers.join(', ');
  }
  const shown = reviewers.slice(0, MAX_REVIEWERS_INLINE).join(', ');
  return `${shown} +${reviewers.length - MAX_REVIEWERS_INLINE}`;
}

interface CIStatusChipProps {
  checks: GitHubChecksSummary;
  t: ReturnType<typeof useTranslation>['t'];
}

const CIStatusChip: React.FC<CIStatusChipProps> = ({ checks, t }) => {
  if (checks.state === GITHUB_CHECKS_STATE_PASSING) {
    return (
      <div style={successStyle} title={t('github.ci.passingTitle', { count: checks.total })}>
        {EMOJI_CHECK} {t('github.ci.passing')}
      </div>
    );
  }
  if (checks.state === GITHUB_CHECKS_STATE_FAILING) {
    const failingLabel = checks.failingChecks.length > 0
      ? t('github.ci.failingWithNames', { names: checks.failingChecks.slice(0, 2).join(', ') })
      : t('github.ci.failing');
    return (
      <div style={warningStyle} title={checks.failingChecks.join(', ')}>
        {EMOJI_WARNING} {failingLabel}
      </div>
    );
  }
  if (checks.state === GITHUB_CHECKS_STATE_PENDING) {
    return (
      <div style={neutralStyle}>
        {EMOJI_CLOCK} {t('github.ci.pending')}
      </div>
    );
  }
  return null;
};
