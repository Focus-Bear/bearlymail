import React from 'react';
import { theme } from 'theme/theme';

import { CalendarCreateInviteModal } from 'components/quick-actions/modals/CalendarCreateInviteModal';
import { CalendarFindEventsModal } from 'components/quick-actions/modals/CalendarFindEventsModal';
import { QuickActionsButton } from 'components/quick-actions/QuickActionsButton';
import { QuickActionsMenu, SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ACTION_TYPE_CALENDAR_CREATE_INVITE, ACTION_TYPE_CALENDAR_FIND_EVENTS } from 'constants/strings';

interface Email {
  id: string;
  subject: string;
  body?: string;
  from: string;
  fromName?: string;
}

interface QuickActionsSectionProps {
  /** Non-GitHub suggested actions to show in the quick actions menu. */
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

/**
 * Renders the Quick Actions button + menu for non-GitHub suggested actions.
 *
 * GitHub-related actions (github_add_comment, github_create_issue,
 * github_search_issues, github_update_status) are intentionally excluded
 * here — they are routed into the GitHub card (GitHubStatusSection →
 * GitHubLinkCard) where they appear in context alongside the linked issue/PR.
 */
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
      {/* Quick actions button — flows in normal document position */}
      <div
        style={{
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <QuickActionsButton actionCount={suggestedActions.length} onClick={onShowMenu} />
      </div>

      {showQuickActionsMenu && (
        <QuickActionsMenu actions={suggestedActions} onSelectAction={onSelectAction} onClose={onCloseMenu} />
      )}

      {selectedAction && (
        <>
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
            <CalendarFindEventsModal attendeeEmail={email.from} onClose={onCloseAction} />
          )}
        </>
      )}
    </>
  );
};
