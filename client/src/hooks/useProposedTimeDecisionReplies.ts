/**
 * Actions behind the scheduling card's proposed-time decision. Accept adds the event to the user's
 * calendar and then DRAFTS a confirmation; Suggest another time DRAFTS a reply listing nearby free
 * slots. Both hand the draft to the reply composer — nothing is ever sent from here.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Email } from 'types/email';
import { plainTextToHtml } from 'utils/emailUtils';
import { buildAcceptanceDraft, buildAlternativesDraft, formatSlotForReply } from 'utils/meetingProposalFormat';
import { captureEvent } from 'utils/posthog';

import { hasProposedTimeDecision, MeetingProposal } from 'components/email-detail/meetingProposal';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { DEFAULT_MEETING_DURATION_MINUTES } from 'constants/numbers';

interface ProposedTimeDecisionRepliesOptions {
  email: Email;
  proposal: MeetingProposal | null;
  /** Everyone to invite (sender + To + CC, minus the user). */
  attendeeEmails: string[];
  /** Creates the calendar event; resolves false when it could not be created. */
  createInvite: (proposedTime: string, durationMinutes: number, topic: string, attendees: string[]) => Promise<boolean>;
  onDraftReply?: (draft: string) => void;
}

export function useProposedTimeDecisionReplies({
  email,
  proposal,
  attendeeEmails,
  createInvite,
  onDraftReply,
}: ProposedTimeDecisionRepliesOptions) {
  const { t, i18n } = useTranslation();
  const [acceptFailed, setAcceptFailed] = useState(false);

  useEffect(() => {
    setAcceptFailed(false);
  }, [email.id]);

  const formatReplySlot = useCallback(
    (slotIso: string) =>
      formatSlotForReply(t, slotIso, proposal?.proposedTimezone, proposal?.userTimezone, i18n.language),
    [t, i18n.language, proposal?.proposedTimezone, proposal?.userTimezone],
  );

  const handleAccept = useCallback(async () => {
    if (!hasProposedTimeDecision(proposal)) {
      return;
    }
    setAcceptFailed(false);
    const isCreated = await createInvite(
      proposal.proposedTime,
      proposal.durationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES,
      proposal.topic ?? email.subject ?? '',
      attendeeEmails,
    );
    if (!isCreated) {
      setAcceptFailed(true);
      return;
    }
    captureEvent(ANALYTICS_EVENTS.SCHEDULING_PROPOSAL_ACCEPTED, { email_id: email.id });
    onDraftReply?.(plainTextToHtml(buildAcceptanceDraft(t, email.fromName, formatReplySlot(proposal.proposedTime))));
  }, [proposal, createInvite, email.subject, email.fromName, email.id, attendeeEmails, onDraftReply, t, formatReplySlot]);

  const handleSuggestAnother = useCallback(() => {
    if (!hasProposedTimeDecision(proposal) || !onDraftReply) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.SCHEDULING_ALTERNATIVES_DRAFTED, { email_id: email.id });
    const draft = buildAlternativesDraft(
      t,
      email.fromName,
      formatReplySlot(proposal.proposedTime),
      (proposal.alternativeSlots ?? []).map(formatReplySlot),
    );
    onDraftReply(plainTextToHtml(draft));
  }, [proposal, onDraftReply, email.id, email.fromName, t, formatReplySlot]);

  return { acceptFailed, handleAccept, handleSuggestAnother };
}
