import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { IcsInfoResponse } from 'types/ics-event';

import { API_URL } from 'config/api';

import { formatDateTime } from './icsDateFormat';

const ACTION_ACCEPT = 'accept' as const;
const ACTION_DECLINE = 'decline' as const;
const RESULT_ACCEPTED = 'accepted' as const;
const RESULT_DECLINED = 'declined' as const;
const DISABLED_OPACITY = 0.6;

type RescheduleAction = typeof ACTION_ACCEPT | typeof ACTION_DECLINE;
type RescheduleResult = typeof RESULT_ACCEPTED | typeof RESULT_DECLINED;

interface IcsRescheduleSectionProps {
  emailId: string;
  attachmentId: string;
  info: IcsInfoResponse;
  /** Called with the server's response after a successful accept/decline. */
  onResolved: (result: { action: RescheduleResult; newStartAt?: string; newEndAt?: string; htmlLink?: string }) => void;
}

/**
 * Shown instead of the generic Add-to-Calendar/RSVP block when an ICS
 * attachment is a METHOD:COUNTER reply — an attendee declined the invite and
 * proposed a new time. Offers "Accept new time" (moves the calendar event and
 * notifies attendees) and "Keep original time" (replies declining the
 * proposal, no calendar change).
 */
export const IcsRescheduleSection: React.FC<IcsRescheduleSectionProps> = ({
  emailId,
  attachmentId,
  info,
  onResolved,
}) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState<RescheduleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RescheduleResult | null>(null);

  const { event, alreadyInCalendar, calendarEventId, currentStartAt, currentEndAt } = info;
  const proposer = event.attendees[0];
  const hasTimeChanged = Boolean(currentStartAt) && currentStartAt !== event.startAt;

  const respond = async (action: RescheduleAction) => {
    setPending(action);
    setError(null);
    try {
      const endpoint = action === ACTION_ACCEPT ? 'accept-reschedule' : 'decline-reschedule';
      const response = await axios.post<{
        success: boolean;
        newStartAt?: string;
        newEndAt?: string;
        htmlLink?: string;
      }>(`${API_URL}/calendar/ics-info/${emailId}/${attachmentId}/${endpoint}`);
      const resolvedAction: RescheduleResult = action === ACTION_ACCEPT ? RESULT_ACCEPTED : RESULT_DECLINED;
      setResult(resolvedAction);
      onResolved({
        action: resolvedAction,
        newStartAt: response.data.newStartAt,
        newEndAt: response.data.newEndAt,
        htmlLink: response.data.htmlLink,
      });
    } catch (err) {
      console.error(`[IcsRescheduleSection] Failed to ${action} reschedule:`, err);
      const serverMessage = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(serverMessage ?? t('emailDetail.icsInvite.reschedule.error'));
    } finally {
      setPending(null);
    }
  };

  let actionArea: React.ReactNode;
  if (!alreadyInCalendar || !calendarEventId) {
    actionArea = (
      <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.warning }}>
        {t('emailDetail.icsInvite.reschedule.noMatchWarning')}
      </div>
    );
  } else if (result) {
    actionArea = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          color: theme.colors.success.main,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        <span>✅</span>
        <span>{t(`emailDetail.icsInvite.reschedule.${result}`)}</span>
      </div>
    );
  } else {
    actionArea = (
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <button
          onClick={() => respond(ACTION_ACCEPT)}
          disabled={pending !== null}
          data-testid="reschedule-accept-btn"
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: pending ? theme.colors.border.medium : theme.colors.primary.main,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: pending !== null ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            opacity: pending !== null && pending !== ACTION_ACCEPT ? DISABLED_OPACITY : 1,
          }}
        >
          {pending === ACTION_ACCEPT
            ? t('emailDetail.icsInvite.reschedule.accepting')
            : t('emailDetail.icsInvite.reschedule.acceptCta')}
        </button>
        <button
          onClick={() => respond(ACTION_DECLINE)}
          disabled={pending !== null}
          data-testid="reschedule-decline-btn"
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: pending !== null ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: pending !== null && pending !== ACTION_DECLINE ? DISABLED_OPACITY : 1,
          }}
        >
          {pending === ACTION_DECLINE
            ? t('emailDetail.icsInvite.reschedule.declining')
            : t('emailDetail.icsInvite.reschedule.declineCta')}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.accent.warning}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginTop: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
      }}
      data-testid="ics-reschedule-section"
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        🔄 {t('emailDetail.icsInvite.reschedule.title')}
      </div>

      {proposer && (
        <div
          style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}
        >
          {t('emailDetail.icsInvite.reschedule.proposedBy', { name: proposer.name || proposer.email })}
        </div>
      )}

      {proposer?.comment && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            fontStyle: 'italic',
            marginBottom: theme.spacing.sm,
          }}
        >
          &ldquo;{proposer.comment}&rdquo;
        </div>
      )}

      <div style={{ fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.sm }}>
        {hasTimeChanged && currentStartAt && (
          <div style={{ color: theme.colors.text.tertiary, textDecoration: 'line-through' }}>
            {t('emailDetail.icsInvite.reschedule.currentTime')}:{' '}
            {formatDateTime(currentStartAt, event.timezone, event.allDay)}
            {currentEndAt && (
              <>
                {' → '}
                {formatDateTime(currentEndAt, event.timezone, event.allDay)}
              </>
            )}
          </div>
        )}
        <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
          {t('emailDetail.icsInvite.reschedule.proposedTime')}: {formatDateTime(event.startAt, event.timezone, event.allDay)}
          {event.endAt && (
            <>
              {' → '}
              {formatDateTime(event.endAt, event.timezone, event.allDay)}
            </>
          )}
        </div>
      </div>

      {actionArea}

      {error && (
        <div
          style={{ color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm, marginTop: theme.spacing.sm }}
          data-testid="reschedule-error"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default IcsRescheduleSection;
