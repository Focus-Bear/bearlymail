import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { ConflictingEvent, ConflictingEventsList } from './ConflictingEventsList';

interface SchedulingRequestCardProps {
  email: Email;
  onDraftReply?: (draft: string) => void;
  schedulingActions?: SuggestedAction[];
}

export interface MeetingProposal {
  hasProposal: boolean;
  proposedTime: string | null;
  /** End of the proposed window when the sender gave a range; null for a fixed time. */
  windowEnd: string | null;
  /** Date the sender named without a time ("the 9th of July"); the backend fills the time from your availability. */
  proposedDate: string | null;
  proposedTimeText: string | null;
  topic: string | null;
  durationMinutes: number | null;
  isAvailable: boolean | null;
  /** Start of the free slot to suggest/pre-fill (UTC ISO); null on conflict or check failure. */
  suggestedTime: string | null;
  calendarConnected: boolean;
  /** True when the user already created an event for this proposal — show it as scheduled, not a conflict. */
  alreadyScheduled?: boolean;
  /** Google Calendar event URL for the already-created event ("View in Google Calendar"). */
  eventLink?: string | null;
  /** Google Meet link for the already-created event, if any. */
  meetLink?: string | null;
  /** The calendar events behind an isAvailable: false verdict, so the UI can name the conflict. */
  conflictingEvents?: ConflictingEvent[];
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

/** Format a UTC ISO string as a short local clock time, e.g. "2:00 PM". */
function formatLocalClockTime(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Resolves the availability line shown under the proposed time. When the sender gave a window
 * (proposal.windowEnd set), the backend finds the first free slot inside it, so we surface that
 * slot ("free at 2:00 PM") instead of a blunt conflict warning.
 */
function resolveAvailabilityText(
  proposal: MeetingProposal,
  translate: ReturnType<typeof useTranslation>['t'],
  locale?: string,
): string | null {
  const prefix = 'emailDetail.schedulingRequest.proposedTime';
  const isWindow = Boolean(proposal.windowEnd);

  if (proposal.isAvailable === true) {
    if (isWindow && proposal.suggestedTime) {
      return translate(`${prefix}.freeAt`, {
        time: formatLocalClockTime(proposal.suggestedTime, locale),
      });
    }
    return translate(`${prefix}.available`);
  }
  if (proposal.isAvailable === false) {
    return translate(isWindow ? `${prefix}.busyWindow` : `${prefix}.conflict`);
  }
  return proposal.calendarConnected ? translate(`${prefix}.checkFailed`) : null;
}

/** Colour for the availability line: green once scheduled or free, red on conflict, grey otherwise. */
function resolveAvailabilityColor(isScheduled: boolean, isAvailable: boolean | null): string {
  if (isScheduled || isAvailable === true) {
    return theme.colors.accent.success;
  }
  if (isAvailable === false) {
    return theme.colors.accent.error;
  }
  return theme.colors.text.tertiary;
}

/**
 * Availability line for an exact, user-picked slot (no window logic — a manual edit is a fixed
 * start). Used after the user changes the time/duration and we re-check free/busy for that slot.
 */
function resolveExactSlotAvailability(
  isAvailable: boolean | null,
  calendarConnected: boolean,
  translate: ReturnType<typeof useTranslation>['t'],
): { text: string | null; color: string } {
  const prefix = 'emailDetail.schedulingRequest.proposedTime';
  if (isAvailable === true) {
    return { text: translate(`${prefix}.available`), color: theme.colors.accent.success };
  }
  if (isAvailable === false) {
    return { text: translate(`${prefix}.conflict`), color: theme.colors.accent.error };
  }
  return {
    text: calendarConnected ? translate(`${prefix}.checkFailed`) : null,
    color: theme.colors.text.tertiary,
  };
}

const DURATION_OPTIONS = [
  SCHEDULING_GAP_15_MIN,
  SCHEDULING_GAP_30_MIN,
  SCHEDULING_GAP_45_MIN,
  SCHEDULING_GAP_60_MIN,
  SCHEDULING_GAP_90_MIN,
];

/** Debounce before re-checking calendar availability while the user edits the time/duration. */
const AVAILABILITY_RECHECK_DEBOUNCE_MS = 500;

/**
 * Re-checks calendar free/busy for the user's edited slot and returns the availability line to
 * show. The proposal's original verdict only covers the proposed slot, so as soon as the user
 * changes the time/duration we re-query that exact slot (debounced) and fall back to `initial`
 * until the first re-check resolves.
 */
function useSlotAvailabilityRecheck(
  time: string,
  duration: number,
  initial: { text: string | null; color: string; conflictingEvents: ConflictingEvent[] },
): { text: string | null; color: string; conflictingEvents: ConflictingEvent[] } {
  const { t } = useTranslation();
  const [recheck, setRecheck] = useState<{
    isAvailable: boolean | null;
    calendarConnected: boolean;
    conflictingEvents?: ConflictingEvent[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [prevTime, setPrevTime] = useState(time);
  const [prevDuration, setPrevDuration] = useState(duration);
  const didMountRef = useRef(false);

  // Reset to the checking state synchronously during render when the inputs change, so we never
  // show the old availability for a frame before the re-check effect runs (derived state pattern).
  if (time !== prevTime || duration !== prevDuration) {
    setPrevTime(time);
    setPrevDuration(duration);
    setChecking(true);
    setRecheck(null);
  }

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const isoTime = datetimeLocalToIso(time);
    if (!isoTime) {
      setRecheck(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const handle = setTimeout(() => {
      axios
        .post<{ isAvailable: boolean | null; calendarConnected: boolean; conflictingEvents?: ConflictingEvent[] }>(
          `${API_URL}/calendar/check-availability`,
          { proposedTime: isoTime, durationMinutes: duration },
        )
        .then((res) => {
          if (!cancelled) {
            setRecheck(res.data);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRecheck({ isAvailable: null, calendarConnected: true, conflictingEvents: [] });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setChecking(false);
          }
        });
    }, AVAILABILITY_RECHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [time, duration]);

  if (checking) {
    return {
      text: t('emailDetail.schedulingRequest.proposedTime.checkingAvailability'),
      color: theme.colors.text.tertiary,
      conflictingEvents: [],
    };
  }
  if (recheck) {
    return {
      ...resolveExactSlotAvailability(recheck.isAvailable, recheck.calendarConnected, t),
      conflictingEvents: recheck.isAvailable === false ? (recheck.conflictingEvents ?? []) : [],
    };
  }
  return initial;
}

interface EditMeetingFormProps {
  initialTime: string;
  initialDuration: number;
  initialTopic: string;
  /** Availability line for the originally proposed slot, shown until the user edits the time. */
  initialAvailabilityText: string | null;
  initialAvailabilityColor: string;
  /** Events behind the original conflict verdict, shown until the user edits the time. */
  initialConflictingEvents: ConflictingEvent[];
  onConfirm: (time: string, duration: number, topic: string) => void;
  onCancel: () => void;
}

const EditMeetingForm: React.FC<EditMeetingFormProps> = ({
  initialTime,
  initialDuration,
  initialTopic,
  initialAvailabilityText,
  initialAvailabilityColor,
  initialConflictingEvents,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [time, setTime] = useState(isoToDatetimeLocal(initialTime));
  const [duration, setDuration] = useState(initialDuration);
  const [topic, setTopic] = useState(initialTopic);
  const availability = useSlotAvailabilityRecheck(time, duration, {
    text: initialAvailabilityText,
    color: initialAvailabilityColor,
    conflictingEvents: initialConflictingEvents,
  });

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

      {availability.text && (
        <div style={{ fontSize: theme.typography.fontSize.sm, color: availability.color }}>
          {availability.text}
        </div>
      )}
      <ConflictingEventsList events={availability.conflictingEvents} />

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

export const ProposedTimeCard: React.FC<ProposedTimeCardProps> = ({
  proposal,
  creating,
  created,
  eventLink,
  meetLink,
  emailSubject,
  onCreateInvite,
}) => {
  const { t, i18n } = useTranslation();
  // Start in editing mode so the user always reviews details before creating (#1788).
  const [isEditing, setIsEditing] = useState(true);

  // Once the event exists, the proposed slot is "busy" only because of the meeting we just booked,
  // so show a scheduled confirmation rather than the stale free/busy verdict / conflict warning.
  const isScheduled = created || proposal.alreadyScheduled === true;

  const availabilityColor = resolveAvailabilityColor(isScheduled, proposal.isAvailable);

  const availabilityText = isScheduled
    ? t('emailDetail.schedulingRequest.proposedTime.scheduled')
    : resolveAvailabilityText(proposal, t, i18n.language);

  // Pre-fill the invite with the suggested free slot when available, else the proposed start.
  const initialInviteTime = proposal.suggestedTime ?? proposal.proposedTime;

  const handleConfirmEdit = (time: string, duration: number, topic: string) => {
    setIsEditing(false);
    onCreateInvite(time, duration, topic);
  };

  const conflictingEvents =
    !isScheduled && proposal.isAvailable === false ? (proposal.conflictingEvents ?? []) : [];

  if (!isScheduled && isEditing && initialInviteTime) {
    return (
      <EditMeetingForm
        initialTime={initialInviteTime}
        initialDuration={proposal.durationMinutes ?? DEFAULT_DURATION}
        initialTopic={proposal.topic ?? emailSubject ?? ''}
        initialAvailabilityText={availabilityText}
        initialAvailabilityColor={availabilityColor}
        initialConflictingEvents={conflictingEvents}
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
        <ConflictingEventsList events={conflictingEvents} />
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

  // Reset per-email creation state when switching emails — the component instance is reused in
  // split/list-detail views, so without this the previous email's "scheduled" state and links would
  // leak onto the newly selected one until its proposal check resolves.
  useEffect(() => {
    setCreated(false);
    setCreating(false);
    setEventLink(null);
    setMeetLink(null);
  }, [email.id]);

  // The proposal check reports when an event was already created for this slot (survives remounts).
  // Reflect it into the created state so the card shows the View/Join links instead of re-offering
  // "Create invite" (which would duplicate the event) or warning about a self-conflict.
  useEffect(() => {
    if (proposal?.alreadyScheduled) {
      setCreated(true);
      setEventLink(proposal.eventLink ?? null);
      setMeetLink(proposal.meetLink ?? null);
    }
  }, [proposal]);

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
