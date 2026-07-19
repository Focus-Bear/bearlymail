import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { GoogleResponseStatus, IcsEventData, IcsInfoResponse } from 'types/ics-event';

import { API_URL } from 'config/api';
import {
  ICS_METHOD_COUNTER,
  ICS_MIME_TYPE,
  ICS_RSVP_ACCEPTED,
  ICS_RSVP_DECLINED,
  ICS_RSVP_NEEDS_ACTION_STATUS,
  ICS_RSVP_TENTATIVE,
  ICS_STATUS_NEEDS_ACTION,
} from 'constants/strings';

import { formatDateTime } from './icsDateFormat';
import { IcsRescheduleSection } from './IcsRescheduleSection';

const MAX_VISIBLE_ATTENDEES = 5;

interface IcsInviteCardProps {
  email: Email;
}

const AttendeesList: React.FC<{ attendees: IcsEventData['attendees']; t: (k: string, opts?: object) => string }> = ({
  attendees,
  t,
}) => {
  const visible = attendees.slice(0, MAX_VISIBLE_ATTENDEES);
  const overflow = attendees.length - MAX_VISIBLE_ATTENDEES;
  return (
    <div style={{ marginTop: theme.spacing.xs }}>
      {visible.map(att => (
        <div key={att.email} style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {att.name ? `${att.name} <${att.email}>` : att.email}
          {att.status && att.status !== ICS_STATUS_NEEDS_ACTION && (
            <span style={{ marginLeft: theme.spacing.xs, color: theme.colors.text.tertiary }}>
              ({att.status.toLowerCase()})
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
          {t('emailDetail.icsInvite.moreAttendees', { count: overflow })}
        </div>
      )}
    </div>
  );
};

/**
 * Rich calendar invite card for emails that contain an ICS attachment.
 * Fetches parsed event details from the server and allows adding the event
 * to Google Calendar or confirms it's already there.
 */
export // eslint-disable-next-line complexity -- pre-existing: complex render with many conditional branches
const IcsInviteCard: React.FC<IcsInviteCardProps> = ({ email }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<IcsInfoResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [eventLink, setEventLink] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<GoogleResponseStatus | undefined>();
  const [rsvpPending, setRsvpPending] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  // Find the ICS attachment
  const icsAttachment = Array.isArray(email.attachments)
    ? email.attachments.find(att => att.mimeType === ICS_MIME_TYPE || att.filename?.toLowerCase().endsWith('.ics'))
    : undefined;

  const fetchIcsInfo = useCallback(async () => {
    if (!icsAttachment) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<IcsInfoResponse>(
        `${API_URL}/calendar/ics-info/${email.id}/${icsAttachment.attachmentId}`
      );
      setInfo(response.data);
      setRsvpStatus(response.data.userResponseStatus);
    } catch (err) {
      console.error('[IcsInviteCard] Failed to fetch ICS info:', err);
      const serverMessage = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(serverMessage ? `Could not parse calendar invite: ${serverMessage}` : t('emailDetail.icsInvite.error'));
    } finally {
      setLoading(false);
    }
  }, [email.id, icsAttachment, t]);

  useEffect(() => {
    fetchIcsInfo();
  }, [fetchIcsInfo]);

  const handleAddToCalendar = async () => {
    if (!icsAttachment) {
      return;
    }
    setAdding(true);
    try {
      const response = await axios.post<{ success: boolean; eventLink?: string }>(
        `${API_URL}/calendar/add-ics-event/${email.id}/${icsAttachment.attachmentId}`
      );
      if (response.data.success) {
        setAdded(true);
        setEventLink(response.data.eventLink ?? null);
      }
    } catch (err) {
      console.error('[IcsInviteCard] Failed to add ICS event to calendar:', err);
      const serverMessage = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(serverMessage ? `Could not add event to calendar: ${serverMessage}` : t('emailDetail.icsInvite.error'));
    } finally {
      setAdding(false);
    }
  };

  const handleRsvp = async (response: 'accepted' | 'declined' | 'tentative') => {
    if (!info?.calendarEventId) {
      return;
    }
    setRsvpPending(response);
    setRsvpError(null);
    try {
      const result = await axios.post<{ userResponseStatus: string; htmlLink?: string }>(
        `${API_URL}/calendar/event/${info.calendarEventId}/rsvp`,
        { response }
      );
      setRsvpStatus(result.data.userResponseStatus as GoogleResponseStatus);
      if (result.data.htmlLink && info) {
        setInfo({ ...info, htmlLink: result.data.htmlLink });
      }
    } catch (err) {
      console.error('[IcsInviteCard] Failed to update RSVP:', err);
      const serverMessage = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setRsvpError(serverMessage ?? t('emailDetail.icsInvite.rsvpError'));
    } finally {
      setRsvpPending(null);
    }
  };

  if (!icsAttachment) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        marginTop: theme.spacing.md,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          borderBottom: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <span style={{ fontSize: '1.5rem' }}>📅</span>
        <h3
          style={{
            margin: 0,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {t('emailDetail.icsInvite.title')}
        </h3>
      </div>

      {loading && (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('emailDetail.icsInvite.loading')}
        </div>
      )}

      {error && !loading && (
        <div style={{ color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm }}>{error}</div>
      )}

      {info && !loading && !error && (
        <>
          {/* Event title */}
          <div
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {info.event.title}
            {info.event.isRecurring && (
              <span
                style={{
                  marginLeft: theme.spacing.sm,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.tertiary,
                  fontWeight: theme.typography.fontWeight.normal,
                }}
              >
                {t('emailDetail.icsInvite.recurring')}
              </span>
            )}
          </div>

          {/* Date/time */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}
          >
            <span>🕐</span>
            <div>
              {info.event.allDay
                ? t('emailDetail.icsInvite.allDay')
                : formatDateTime(info.event.startAt, info.event.timezone)}
              {info.event.endAt && !info.event.allDay && (
                <span style={{ color: theme.colors.text.tertiary }}>
                  {' → '}
                  {formatDateTime(info.event.endAt, info.event.timezone)}
                </span>
              )}
            </div>
          </div>

          {/* Location */}
          {info.event.location && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.sm,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}
            >
              <span>📍</span>
              <span>{info.event.location}</span>
            </div>
          )}

          {/* Organizer */}
          {info.event.organizer && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.sm,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}
            >
              <span>👤</span>
              <div>
                <strong>{t('emailDetail.icsInvite.organizer')}:</strong>{' '}
                {info.event.organizer.name
                  ? `${info.event.organizer.name} <${info.event.organizer.email}>`
                  : info.event.organizer.email}
              </div>
            </div>
          )}

          {/* Attendees */}
          {info.event.attendees.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.md,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}
            >
              <span>👥</span>
              <div>
                <strong>{t('emailDetail.icsInvite.attendees')}:</strong>
                <AttendeesList attendees={info.event.attendees} t={t as (k: string, opts?: object) => string} />
              </div>
            </div>
          )}

          {/* Reschedule request (METHOD:COUNTER) — replaces the generic RSVP block below */}
          {info.event.method?.toUpperCase() === ICS_METHOD_COUNTER && (
            <IcsRescheduleSection
              emailId={email.id}
              attachmentId={icsAttachment.attachmentId}
              info={info}
              onResolved={({ htmlLink: resolvedHtmlLink }) => {
                if (resolvedHtmlLink) {
                  setInfo(current => (current ? { ...current, htmlLink: resolvedHtmlLink } : current));
                }
              }}
            />
          )}

          {/* Calendar action — hidden for a reschedule request; IcsRescheduleSection above owns the actions instead */}
          {info.event.method?.toUpperCase() !== ICS_METHOD_COUNTER && (
          <div style={{ marginTop: theme.spacing.md }}>
            {info.alreadyInCalendar || added ? (
              <div>
                {/* RSVP status badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    color: theme.colors.success.main,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  <span>✅</span>
                  <span>{added ? t('emailDetail.icsInvite.added') : t('emailDetail.icsInvite.alreadyAdded')}</span>
                  {rsvpStatus && (
                    <span
                      style={{
                        marginLeft: theme.spacing.xs,
                        padding: `2px ${theme.spacing.sm}`,
                        borderRadius: theme.borderRadius.sm,
                        backgroundColor: theme.colors.background.default,
                        border: `1px solid ${theme.colors.border.light}`,
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.secondary,
                      }}
                      data-testid="rsvp-status-badge"
                    >
                      {rsvpStatus === ICS_RSVP_ACCEPTED && <span>✅ </span>}
                      {rsvpStatus === ICS_RSVP_DECLINED && <span>❌ </span>}
                      {rsvpStatus === ICS_RSVP_TENTATIVE && <span>❓ </span>}
                      {rsvpStatus === ICS_RSVP_NEEDS_ACTION_STATUS && <span>⏳ </span>}
                      <span>{t(`emailDetail.icsInvite.rsvpStatus.${rsvpStatus}`)}</span>
                    </span>
                  )}
                </div>

                {/* RSVP action buttons */}
                {info.calendarEventId && (
                  <div
                    style={{
                      display: 'flex',
                      gap: theme.spacing.sm,
                      marginBottom: theme.spacing.sm,
                      flexWrap: 'wrap',
                    }}
                  >
                    {(['accepted', 'tentative', 'declined'] as const).map(response => {
                      const isActive = rsvpStatus === response;
                      const isThisPending = rsvpPending === response;
                      const isAnyPending = rsvpPending !== null;
                      const RSVP_DISABLED_OPACITY = 0.6;
                      const labelKey =
                        response === ICS_RSVP_ACCEPTED // eslint-disable-line no-nested-ternary
                          ? 'emailDetail.icsInvite.rsvpAccept'
                          : response === ICS_RSVP_TENTATIVE
                            ? 'emailDetail.icsInvite.rsvpTentative'
                            : 'emailDetail.icsInvite.rsvpDecline';
                      return (
                        <button
                          key={response}
                          onClick={() => handleRsvp(response)}
                          disabled={isActive || isAnyPending}
                          data-testid={`rsvp-btn-${response}`}
                          style={{
                            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                            backgroundColor: isActive ? theme.colors.primary.main : theme.colors.background.paper,
                            color: isActive ? theme.colors.common.white : theme.colors.text.primary,
                            border: `1px solid ${isActive ? theme.colors.primary.main : theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.md,
                            cursor: isActive || isAnyPending ? 'not-allowed' : 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                            fontWeight: theme.typography.fontWeight.medium,
                            opacity: isAnyPending && !isThisPending ? RSVP_DISABLED_OPACITY : 1,
                          }}
                        >
                          {isThisPending ? t('emailDetail.icsInvite.rsvpUpdating') : t(labelKey)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* RSVP error */}
                {rsvpError && (
                  <div
                    style={{
                      color: theme.colors.accent.error,
                      fontSize: theme.typography.fontSize.sm,
                      marginBottom: theme.spacing.sm,
                    }}
                    data-testid="rsvp-error"
                  >
                    {rsvpError}
                  </div>
                )}

                {/* View in Calendar link */}
                {(eventLink || info.htmlLink) && (
                  <a
                    href={eventLink || info.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: theme.colors.primary.main,
                      fontSize: theme.typography.fontSize.sm,
                      textDecoration: 'none',
                    }}
                    data-testid="view-in-calendar-link"
                  >
                    {t('emailDetail.icsInvite.viewInCalendar')}
                  </a>
                )}
              </div>
            ) : (
              <button
                onClick={handleAddToCalendar}
                disabled={adding}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: adding ? theme.colors.border.medium : theme.colors.primary.main,
                  color: theme.colors.common.white,
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: adding ? 'not-allowed' : 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {adding ? t('emailDetail.icsInvite.adding') : t('emailDetail.icsInvite.addToCalendar')}
              </button>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
};
