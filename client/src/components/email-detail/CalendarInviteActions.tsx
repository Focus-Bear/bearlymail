import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CALENDAR } from 'constants/emojis';
import { OPACITY_HALF } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface CalendarInviteActionsProps {
  email: Email;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

const RESPONSE_STATUS_ACCEPTED = 'accepted' as const;
const RESPONSE_STATUS_DECLINED = 'declined' as const;
type ResponseStatus = typeof RESPONSE_STATUS_ACCEPTED | typeof RESPONSE_STATUS_DECLINED;


function getAcceptButtonBg(responseStatus: ResponseStatus | null, isDisabled: boolean): string {
  if (responseStatus === RESPONSE_STATUS_ACCEPTED) return theme.colors.success.main;
  return isDisabled ? theme.colors.border.medium : theme.colors.primary.main;
}
function getDeclineButtonBg(responseStatus: ResponseStatus | null, isDisabled: boolean): string {
  if (responseStatus === RESPONSE_STATUS_DECLINED) return theme.colors.text.secondary;
  return isDisabled ? theme.colors.border.medium : 'transparent';
}
function getAcceptLabel(responding: boolean, responseStatus: ResponseStatus | null, tFunc: (tKey: string, fb?: string) => string): string {
  if (responding && responseStatus !== RESPONSE_STATUS_ACCEPTED) return tFunc('emailDetail.calendarInvite.accepting', 'Accepting...');
  if (responseStatus === RESPONSE_STATUS_ACCEPTED) return tFunc('emailDetail.calendarInvite.accepted', 'Accepted');
  return tFunc('emailDetail.calendarInvite.accept', 'Accept');
}
function getDeclineLabel(responding: boolean, responseStatus: ResponseStatus | null, tFunc: (tKey: string, fb?: string) => string): string {
  if (responding && responseStatus !== RESPONSE_STATUS_DECLINED) return tFunc('emailDetail.calendarInvite.declining', 'Declining...');
  if (responseStatus === RESPONSE_STATUS_DECLINED) return tFunc('emailDetail.calendarInvite.declined', 'Declined');
  return tFunc('emailDetail.calendarInvite.decline', 'Decline');
}

export const CalendarInviteActions: React.FC<CalendarInviteActionsProps> = ({
  email,
  onAccept,
  onDecline,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  const [responseStatus, setResponseStatus] = useState<typeof RESPONSE_STATUS_ACCEPTED | typeof RESPONSE_STATUS_DECLINED | null>(null);

  const makeHandler = (action: () => Promise<void>, status: ResponseStatus, eventName: string, errorKey: string) => async () => {
    setResponding(true); setResponseStatus(null);
    captureEvent(eventName, { email_id: email.id });
    try { await action(); setResponseStatus(status); }
    catch (error) { console.error(`Error ${status}:`, error); alert(t(`emailDetail.calendarInvite.${errorKey}`) || `Failed to ${status} invitation`); }
    finally { setResponding(false); }
  };
  const handleAccept = makeHandler(onAccept, RESPONSE_STATUS_ACCEPTED, 'calendar_invite_accept_clicked', 'acceptError');
  const handleDecline = makeHandler(onDecline, RESPONSE_STATUS_DECLINED, 'calendar_invite_decline_clicked', 'declineError');

  const isDisabled = loading || responding;

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.sm,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{EMOJI_CALENDAR}</span>
        <span style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {t('emailDetail.calendarInvite.title') || 'Calendar Invitation'}
        </span>
      </div>
      
      <div style={{
        display: 'flex',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
      }}>
        <button onClick={handleAccept} disabled={isDisabled || responseStatus === RESPONSE_STATUS_ACCEPTED}
          style={{ flex: 1, minWidth: '120px', padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: getAcceptButtonBg(responseStatus, isDisabled),
            color: COLOR_NAMED_WHITE, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.semibold,
            cursor: isDisabled || responseStatus === RESPONSE_STATUS_ACCEPTED ? 'not-allowed' : 'pointer', fontSize: theme.typography.fontSize.sm,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs,
            opacity: responseStatus === RESPONSE_STATUS_DECLINED ? OPACITY_HALF : 1 }}>
          {getAcceptLabel(responding, responseStatus, t)}
        </button>
        <button onClick={handleDecline} disabled={isDisabled || responseStatus === RESPONSE_STATUS_DECLINED}
          style={{ flex: 1, minWidth: '120px', padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: getDeclineButtonBg(responseStatus, isDisabled),
            color: responseStatus === RESPONSE_STATUS_DECLINED ? COLOR_NAMED_WHITE : theme.colors.text.secondary,
            border: `1px solid ${responseStatus === RESPONSE_STATUS_DECLINED ? 'transparent' : theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md, fontWeight: theme.typography.fontWeight.semibold,
            cursor: isDisabled || responseStatus === RESPONSE_STATUS_DECLINED ? 'not-allowed' : 'pointer', fontSize: theme.typography.fontSize.sm,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs,
            opacity: responseStatus === RESPONSE_STATUS_ACCEPTED ? OPACITY_HALF : 1 }}>
          {getDeclineLabel(responding, responseStatus, t)}
        </button>
      </div>
    </div>
  );
};
