import React from 'react';
import { theme } from 'theme/theme';

import { CalendarCreateInviteModal } from 'components/quick-actions/modals/CalendarCreateInviteModal';
import { CalendarFindEventsModal } from 'components/quick-actions/modals/CalendarFindEventsModal';
import { GitHubAddCommentModal } from 'components/quick-actions/modals/GitHubAddCommentModal';
import { GitHubCreateIssueModal } from 'components/quick-actions/modals/GitHubCreateIssueModal';
import { GitHubSearchIssuesModal } from 'components/quick-actions/modals/GitHubSearchIssuesModal';
import { GitHubUpdateStatusModal } from 'components/quick-actions/modals/GitHubUpdateStatusModal';
import { QuickActionsButton } from 'components/quick-actions/QuickActionsButton';
import { QuickActionsMenu, SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_CALENDAR_FIND_EVENTS,
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
} from 'constants/strings';

interface Email {
  id: string;
  subject: string;
  body?: string;
  from: string;
  fromName?: string;
}

interface QuickActionsSectionProps {
  suggestedActions: SuggestedAction[];
  showQuickActionsMenu: boolean;
  selectedAction: SuggestedAction | null;
  email: Email | null;
  onShowMenu: () => void;
  onCloseMenu: () => void;
  onSelectAction: (action: SuggestedAction) => void;
  onCloseAction: () => void;
  onActionSuccess: () => void;
}

export const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({
  suggestedActions,
  showQuickActionsMenu,
  selectedAction,
  email,
  onShowMenu,
  onCloseMenu,
  onSelectAction,
  onCloseAction,
  onActionSuccess,
}) => {
  return (
    <>
      {/* Sticky container for quick actions button */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: theme.colors.background.default,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.sm,
        marginTop: -theme.spacing.md,
        marginBottom: theme.spacing.sm,
      }}>
        <QuickActionsButton
          actionCount={suggestedActions.length}
          onClick={onShowMenu}
        />
      </div>

      {showQuickActionsMenu && (
        <QuickActionsMenu
          actions={suggestedActions}
          onSelectAction={onSelectAction}
          onClose={onCloseMenu}
        />
      )}

      {selectedAction && (
        <>
          {selectedAction.type === ACTION_TYPE_GITHUB_CREATE_ISSUE && email && email.body && (
            <GitHubCreateIssueModal
              email={{
                subject: email.subject,
                body: email.body,
                from: email.from,
                fromName: email.fromName,
              }}
              defaultRepo={selectedAction.metadata?.defaultRepo as { owner: string; repo: string } | undefined}
              onClose={onCloseAction}
              onSuccess={onActionSuccess}
            />
          )}
          {selectedAction.type === ACTION_TYPE_GITHUB_UPDATE_STATUS && selectedAction.metadata?.issueInfo && (
            <GitHubUpdateStatusModal
              issueInfo={selectedAction.metadata.issueInfo}
              onClose={onCloseAction}
              onSuccess={onActionSuccess}
            />
          )}
          {selectedAction.type === ACTION_TYPE_GITHUB_ADD_COMMENT && selectedAction.metadata?.issueInfo && email && email.body && (
            <GitHubAddCommentModal
              issueInfo={selectedAction.metadata.issueInfo}
              email={{ body: email.body }}
              onClose={onCloseAction}
              onSuccess={onActionSuccess}
            />
          )}
          {selectedAction.type === ACTION_TYPE_GITHUB_SEARCH_ISSUES && email && email.body && (
            <GitHubSearchIssuesModal
              email={{
                subject: email.subject,
                body: email.body,
              }}
              onClose={onCloseAction}
            />
          )}
          {selectedAction.type === ACTION_TYPE_CALENDAR_CREATE_INVITE && email && email.body && (
            <CalendarCreateInviteModal
              email={{
                subject: email.subject,
                body: email.body,
                from: email.from,
                fromName: email.fromName,
              }}
              onClose={onCloseAction}
              onSuccess={onActionSuccess}
            />
          )}
          {selectedAction.type === ACTION_TYPE_CALENDAR_FIND_EVENTS && email && (
            <CalendarFindEventsModal
              attendeeEmail={email.from}
              onClose={onCloseAction}
            />
          )}
        </>
      )}
    </>
  );
};



