import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { normalizeAiReplyPlaintext, plainTextToHtml } from 'utils/emailUtils';
import { captureEvent } from 'utils/posthog';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CALENDAR } from 'constants/emojis';
import {
  SCHEDULING_GAP_15_MIN,
  SCHEDULING_GAP_30_MIN,
  SCHEDULING_GAP_45_MIN,
  SCHEDULING_GAP_60_MIN,
  SCHEDULING_GAP_90_MIN,
  SHORT_TIMEOUT_MS,
} from 'constants/numbers';
import { STRING_NONE, STRING_TRANSPARENT } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

interface SchedulingRequestCardProps {
  email: Email;
  onDraftReply?: (draft: string) => void;
  schedulingActions?: SuggestedAction[];
}

interface MeetingProposal {
  hasProposal: boolean;
  proposedTime: string | null;
  proposedTimeText: string | null;
  topic: string | null;
  durationMinutes: number | null;
  isAvailable: boolean | null;
  calendarConnected: boolean;
}

interface SchedulingActionButtonsProps {
  linkCopied: boolean;
  drafting: boolean;
  onCopyLink: () => void;
  onDraftReply: () => void;
}

const SchedulingActionButtons: React.FC<SchedulingActionButtonsProps> = ({
  linkCopied,
  drafting,
  onCopyLink,
  onDraftReply,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
      <button
        onClick={onCopyLink}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: linkCopied ? theme.colors.accent.success : theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.lg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {linkCopied ? t('emailDetail.schedulingRequest.linkCopied') : t('emailDetail.schedulingRequest.copyLink')}
      </button>

      <button
        onClick={onDraftReply}
        disabled={drafting}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: drafting ? theme.colors.border.medium : 'transparent',
          color: drafting ? 'white' : theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: drafting ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.lg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {drafting ? t('emailDetail.schedulingRequest.drafting') : t('emailDetail.schedulingRequest.draftReply')}
      </button>
    </div>
  );
};

/** Convert an ISO 8601 UTC string to a value suitable for a datetime-local input (local time). */
function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return '';
  }
  // Format as YYYY-MM-DDTHH:mm in local time
  const pad = (digit: number) => String(digit).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Convert a datetime-local input value back to an ISO 8601 UTC string. */
function datetimeLocalToIso(local: string): string {
  const date = new Date(local);
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

const DURATION_OPTIONS = [
  SCHEDULING_GAP_15_MIN,
  SCHEDULING_GAP_30_MIN,
  SCHEDULING_GAP_45_MIN,
  SCHEDULING_GAP_60_MIN,
  SCHEDULING_GAP_90_MIN,
];

interface EditMeetingFormProps {
  initialTime: string;
  initialDuration: number;
  initialTopic: string;
  onConfirm: (time: string, duration: number, topic: string) => void;
  onCancel: () => void;
}

const EditMeetingForm: React.FC<EditMeetingFormProps> = ({
  initialTime,
  initialDuration,
  initialTopic,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [time, setTime] = useState(isoToDatetimeLocal(initialTime));
  const [duration, setDuration] = useState(initialDuration);
  const [topic, setTopic] = useState(initialTopic);

  const handleConfirm = () => {
    const isoTime = datetimeLocalToIso(time);
    if (!isoTime) {
      return;
    }
    onConfirm(isoTime, duration, topic);
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.default,
        borderRadius: theme.borderRadius.sm,
        padding: theme.spacing.sm,
        border: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      <div style={{ fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
        {t('emailDetail.schedulingRequest.proposedTime.editTitle')}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('emailDetail.schedulingRequest.proposedTime.timeLabel')}
        </span>
        <input
          type="datetime-local"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.background.paper,
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('emailDetail.schedulingRequest.proposedTime.durationLabel')}
        </span>
        <select
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.background.paper,
          }}
        >
          {DURATION_OPTIONS.map((mins) => (
            <option key={mins} value={mins}>
              {t('emailDetail.schedulingRequest.proposedTime.durationMinutes', { minutes: mins })}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('emailDetail.schedulingRequest.proposedTime.topicLabel')}
        </span>
        <input
          type="text"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={100}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.background.paper,
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <button
          onClick={handleConfirm}
          style={{
            flex: 1,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {t('emailDetail.schedulingRequest.proposedTime.confirm')}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: STRING_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {t('emailDetail.schedulingRequest.proposedTime.cancel')}
        </button>
      </div>
    </div>
  );
};

interface ProposedTimeCardProps {
  proposal: MeetingProposal;
  creating: boolean;
  created: boolean;
  eventLink: string | null;
  meetLink: string | null;
  emailSubject: string;
  onCreateInvite: (time: string, duration: number, topic: string) => void;
}

const DEFAULT_DURATION = 30;

const ProposedTimeCard: React.FC<ProposedTimeCardProps> = ({
  proposal,
  creating,
  created,
  eventLink,
  meetLink,
  emailSubject,
  onCreateInvite,
}) => {
  const { t } = useTranslation();
  // Start in editing mode so the user always reviews details before creating (#1788).
  const [isEditing, setIsEditing] = useState(true);

  const availabilityColor =
    proposal.isAvailable === true
      ? theme.colors.accent.success
      : proposal.isAvailable === false
        ? theme.colors.accent.error
        : theme.colors.text.tertiary;

  const availabilityText =
    proposal.isAvailable === true
      ? t('emailDetail.schedulingRequest.proposedTime.available')
      : proposal.isAvailable === false
        ? t('emailDetail.schedulingRequest.proposedTime.conflict')
        : proposal.calendarConnected
          ? t('emailDetail.schedulingRequest.proposedTime.checkFailed')
          : null;

  const handleConfirmEdit = (time: string, duration: number, topic: string) => {
    setIsEditing(false);
    onCreateInvite(time, duration, topic);
  };

  if (isEditing && proposal.proposedTime) {
    return (
      <EditMeetingForm
        initialTime={proposal.proposedTime}
        initialDuration={proposal.durationMinutes ?? DEFAULT_DURATION}
        initialTopic={proposal.topic ?? emailSubject ?? ''}
        onConfirm={handleConfirmEdit}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {/* Proposed time details */}
      <div
        style={{
          backgroundColor: theme.colors.background.default,
          borderRadius: theme.borderRadius.sm,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginBottom: '2px' }}>
          {t('emailDetail.schedulingRequest.proposedTime.label')}
        </div>
        <div style={{ fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
          {proposal.proposedTimeText}
        </div>
        {proposal.topic && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginTop: '2px' }}>
            {proposal.topic}
          </div>
        )}
        {availabilityText && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: availabilityColor, marginTop: theme.spacing.xs }}>
            {availabilityText}
          </div>
        )}
      </div>

      {/* When not yet created: re-open the review form to confirm details */}
      {!creating && !created && (
        <button
          onClick={() => setIsEditing(true)}
          style={{
            flex: 1,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.lg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {t('emailDetail.schedulingRequest.proposedTime.createInvite')}
        </button>
      )}

      {/* Creating indicator while the calendar event is being created */}
      {creating && !created && (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.base }}>
          {t('emailDetail.schedulingRequest.proposedTime.creating')}
        </div>
      )}

      {/* After creation: links to view/join the event */}
      {created && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          {eventLink && (
            <a
              href={eventLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.accent.success,
                color: COLOR_NAMED_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.lg,
                textDecoration: 'none',
              }}
            >
              {t('emailDetail.schedulingRequest.proposedTime.viewEvent')}
            </a>
          )}
          {meetLink && (
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: STRING_TRANSPARENT,
                color: theme.colors.text.secondary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.lg,
                textDecoration: 'none',
              }}
            >
              {t('emailDetail.schedulingRequest.proposedTime.joinMeeting')}
            </a>
          )}
          {!eventLink && !meetLink && (
            <div style={{ color: theme.colors.accent.success, fontSize: theme.typography.fontSize.base }}>
              {t('emailDetail.schedulingRequest.proposedTime.created')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SchedulingDebugPanelProps {
  proposal: MeetingProposal | null;
  proposalLoading: boolean;
  schedulingActions: SuggestedAction[];
}

const SchedulingDebugPanel: React.FC<SchedulingDebugPanelProps> = ({
  proposal,
  proposalLoading,
  schedulingActions,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const proposalData = proposalLoading
    ? t('debug.schedulingCard.loading')
    : JSON.stringify(proposal, null, 2);
  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        borderTop: `1px dashed ${theme.colors.border.medium}`,
        paddingTop: theme.spacing.sm,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.tertiary,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {expanded ? '▼' : '▶'} {t('debug.schedulingCard.toggle')}
      </button>
      {expanded && (
        <div
          style={{
            marginTop: theme.spacing.xs,
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.sm,
            padding: theme.spacing.sm,
            fontFamily: 'monospace',
            fontSize: '11px',
            color: theme.colors.text.secondary,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          <strong>{t('debug.schedulingCard.actionsHeader', { count: schedulingActions.length })}</strong>
          <div>{JSON.stringify(schedulingActions, null, 2)}</div>
          <br />
          <strong>{t('debug.schedulingCard.proposalHeader')}</strong>
          <div>{proposalData}</div>
        </div>
      )}
    </div>
  );
};

export const SchedulingRequestCard: React.FC<SchedulingRequestCardProps> = ({ email, onDraftReply, schedulingActions = [] }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [linkCopied, setLinkCopied] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [proposal, setProposal] = useState<MeetingProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  /** Google Calendar event URL (htmlLink) — used for the "View in Google Calendar" button. */
  const [eventLink, setEventLink] = useState<string | null>(null);
  /** Google Meet link — shown separately as "Join Meeting" if present. */
  const [meetLink, setMeetLink] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProposalLoading(true);
    axios
      .post<MeetingProposal>(`${API_URL}/calendar/check-proposed-time/${email.id}`)
      .then((res) => {
        if (!cancelled) {
          setProposal(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProposal(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProposalLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [email.id]);

  const handleCopyLink = useCallback(async () => {
    const schedulingUrl = `${window.location.origin}/book/${user?.id ?? ''}`;
    try {
      await navigator.clipboard.writeText(schedulingUrl);
      setLinkCopied(true);
      captureEvent(ANALYTICS_EVENTS.SCHEDULING_LINK_COPIED, { email_id: email.id });
      setTimeout(() => setLinkCopied(false), SHORT_TIMEOUT_MS);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [email.id, user?.id]);

  const handleDraftReply = useCallback(async () => {
    setDrafting(true);
    captureEvent(ANALYTICS_EVENTS.SCHEDULING_DRAFT_REPLY_CLICKED, { email_id: email.id });
    try {
      const response = await axios.post(`${API_URL}/calendar/meeting-reply/${email.id}`);
      if (response.data?.draft && onDraftReply) {
        // Convert plaintext (with \n\n paragraph breaks) to HTML so Tiptap renders
        // proper paragraphs instead of collapsing newlines into a wall of text —
        // mirrors the suggested-replies flow in useReplyDraftGeneration.
        const htmlDraft = plainTextToHtml(normalizeAiReplyPlaintext(response.data.draft));
        onDraftReply(htmlDraft);
      }
    } catch (err) {
      console.error('Failed to draft meeting reply:', err);
    } finally {
      setDrafting(false);
    }
  }, [email.id, onDraftReply]);

  const handleCreateInvite = useCallback(async (
    proposedTime: string,
    durationMinutes: number,
    topic: string,
  ) => {
    setCreating(true);
    captureEvent(ANALYTICS_EVENTS.SCHEDULING_DRAFT_REPLY_CLICKED, { email_id: email.id, action: 'create_invite' });
    try {
      const response = await axios.post<{ meetLink: string | null; eventId: string | null; htmlLink: string | null }>(
        `${API_URL}/calendar/create-from-email-proposal`,
        {
          emailId: email.id,
          proposedTime,
          topic,
          durationMinutes,
        },
      );
      setCreated(true);
      // Use the Google Calendar event URL (htmlLink) for "View in Google Calendar" (#1788).
      setEventLink(response.data.htmlLink);
      setMeetLink(response.data.meetLink);
    } catch (err) {
      console.error('Failed to create calendar invite:', err);
    } finally {
      setCreating(false);
    }
  }, [email.id]);

  const showProposedTimeCard = !proposalLoading && proposal?.hasProposal === true && Boolean(proposal.proposedTime);

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.primary.main}`,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{EMOJI_CALENDAR}</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('emailDetail.schedulingRequest.title')}
        </span>
      </div>

      {proposalLoading ? (
        /* Show a spinner while checking for a meeting proposal — prevents the
           SchedulingActionButtons from flashing before the API call returns (#1788). */
        <div
          style={{
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {t('emailDetail.schedulingRequest.checkingProposal')}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: theme.typography.fontSize.lg,
              color: theme.colors.text.secondary,
              lineHeight: theme.typography.lineHeight.normal,
            }}
          >
            {showProposedTimeCard
              ? t('emailDetail.schedulingRequest.proposedTime.description')
              : t('emailDetail.schedulingRequest.description')}
          </div>

          {showProposedTimeCard ? (
            <ProposedTimeCard
              proposal={proposal!}
              creating={creating}
              created={created}
              eventLink={eventLink}
              meetLink={meetLink}
              emailSubject={email.subject ?? ''}
              onCreateInvite={handleCreateInvite}
            />
          ) : (
            <SchedulingActionButtons
              linkCopied={linkCopied}
              drafting={drafting}
              onCopyLink={handleCopyLink}
              onDraftReply={handleDraftReply}
            />
          )}
        </>
      )}
      {user?.isAdmin && (
        <SchedulingDebugPanel
          proposal={proposal}
          proposalLoading={proposalLoading}
          schedulingActions={schedulingActions}
        />
      )}
    </div>
  );
};
