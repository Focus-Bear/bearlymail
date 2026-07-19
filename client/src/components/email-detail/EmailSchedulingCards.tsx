/**
 * EmailSchedulingCards — the scheduling/calendar surfaces for a single email.
 *
 * Extracted from EmailDetailActions so the same cards can render either inline in
 * the main email column (full/inline views) or inside the split-view action
 * sidebar (compact view). Renders at most one card, chosen deterministically:
 *
 *   1. ICS attachment present        → IcsInviteCard
 *   2. AI-detected scheduling request → SchedulingRequestCard (Create Calendar Invite)
 *   3. Plain calendar invitation      → CalendarInviteActions (Accept / Decline)
 *
 * Returns null when none apply, so callers can render it unconditionally.
 */
import React, { useMemo } from 'react';
import { Email } from 'types/email';
import { isCalendarInvitation } from 'utils/calendarUtils';

import { CalendarInviteActions } from 'components/email-detail/CalendarInviteActions';
import { IcsInviteCard } from 'components/email-detail/IcsInviteCard';
import { SchedulingRequestCard } from 'components/email-detail/SchedulingRequestCard';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_SCHEDULING_REQUEST,
  ICS_MIME_TYPE,
} from 'constants/strings';

interface EmailSchedulingCardsProps {
  email: Email;
  /** Scheduling-specific suggested actions (scheduling_request, calendar_create_invite). */
  schedulingActions?: SuggestedAction[];
  /** True while suggested actions are being fetched — suppresses CalendarInviteActions
   *  until we know whether a scheduling card should replace it (#1788). */
  loadingSchedulingActions?: boolean;
  onDraftReply?: (draft: string) => void;
  onRespondToInvitation?: (emailId: string, response: 'accepted' | 'declined' | 'tentative') => Promise<void>;
}

export const EmailSchedulingCards: React.FC<EmailSchedulingCardsProps> = ({
  email,
  schedulingActions = [],
  loadingSchedulingActions = false,
  onDraftReply,
  onRespondToInvitation,
}) => {
  const isInvitation = useMemo(() => isCalendarInvitation(email), [email]);

  // Deterministic ICS attachment detection — checked via MIME type and filename,
  // not via LLM. Takes priority over the generic SchedulingRequestCard.
  const hasIcsAttachment = useMemo(
    () =>
      Array.isArray(email.attachments) &&
      email.attachments.some(att => att.mimeType === ICS_MIME_TYPE || att.filename?.toLowerCase()?.endsWith('.ics')),
    [email.attachments]
  );

  // Derive hasSchedulingRequest from the pre-partitioned schedulingActions list.
  // Treat both scheduling_request and calendar_create_invite as scheduling triggers.
  const hasSchedulingRequest = useMemo(
    () =>
      schedulingActions.some(
        action => action.type === ACTION_TYPE_SCHEDULING_REQUEST || action.type === ACTION_TYPE_CALENDAR_CREATE_INVITE
      ),
    [schedulingActions]
  );

  if (hasIcsAttachment) {
    return <IcsInviteCard email={email} />;
  }

  if (hasSchedulingRequest) {
    return <SchedulingRequestCard email={email} onDraftReply={onDraftReply} schedulingActions={schedulingActions} />;
  }

  if (!loadingSchedulingActions && isInvitation && onRespondToInvitation) {
    return (
      <CalendarInviteActions
        email={email}
        onAccept={() => onRespondToInvitation(email.id, 'accepted')}
        onDecline={() => onRespondToInvitation(email.id, 'declined')}
      />
    );
  }

  return null;
};
