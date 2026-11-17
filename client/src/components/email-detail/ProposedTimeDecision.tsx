/**
 * ProposedTimeDecision — the one-glance answer to "they proposed a time; can I make it?".
 *
 * Shows the proposed slot in the sender's zone and the user's ("11:30 AM Perth = 2:30 PM your time
 * (Tue 10 Nov)") with the free/busy verdict, then the next step: Accept & add to calendar when free,
 * or the nearby free times first when busy. Every reply is only drafted — nothing is sent.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { describeProposedSlot, formatInZone } from 'utils/meetingProposalFormat';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE, STRING_TRANSPARENT } from 'constants/strings';

import { ConflictingEventsList } from './ConflictingEventsList';
import type { MeetingProposal } from './meetingProposal';

const KEY_PREFIX = 'emailDetail.schedulingRequest.decision';
const ALTERNATIVE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};

interface ProposedTimeDecisionProps {
  proposal: MeetingProposal & { proposedTime: string };
  accepting: boolean;
  acceptFailed: boolean;
  /** False when there is no reply composer to draft into; the reply actions are then hidden. */
  canDraftReply: boolean;
  onAccept: () => void;
  onSuggestAnother: () => void;
  onEditDetails: () => void;
}

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  minWidth: '120px',
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.lg,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: STRING_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.medium}`,
};

const linkButtonStyle: React.CSSProperties = {
  background: STRING_NONE,
  border: STRING_NONE,
  padding: 0,
  cursor: 'pointer',
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
  textDecoration: 'underline',
  alignSelf: 'flex-start',
};

interface AlternativeSlotListProps {
  slots: string[];
  userTimezone: string | undefined;
}

const AlternativeSlotList: React.FC<AlternativeSlotListProps> = ({ slots, userTimezone }) => {
  const { t, i18n } = useTranslation();
  if (slots.length === 0) {
    return (
      <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
        {t(`${KEY_PREFIX}.noAlternatives`)}
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
        {t(`${KEY_PREFIX}.alternativesHeading`)}
      </div>
      <ul style={{ margin: `${theme.spacing.xs} 0 0`, paddingLeft: theme.spacing.lg }}>
        {slots.map((slot) => (
          <li key={slot} style={{ fontSize: theme.typography.fontSize.base, color: theme.colors.text.primary }}>
            {formatInZone(slot, userTimezone, i18n.language, ALTERNATIVE_FORMAT)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ProposedTimeDecision: React.FC<ProposedTimeDecisionProps> = ({
  proposal,
  accepting,
  acceptFailed,
  canDraftReply,
  onAccept,
  onSuggestAnother,
  onEditDetails,
}) => {
  const { t, i18n } = useTranslation();
  const slot = describeProposedSlot(
    proposal.proposedTime,
    proposal.proposedTimezone,
    proposal.userTimezone,
    i18n.language,
  );
  const isFree = proposal.isAvailable === true;
  const alternatives = proposal.alternativeSlots ?? [];
  const canSuggest = canDraftReply && alternatives.length > 0;

  const summary = slot.isSameWallClock
    ? t(`${KEY_PREFIX}.localOnly`, { localTime: slot.localTime, localDate: slot.localDate })
    : t(`${KEY_PREFIX}.conversion`, {
        senderTime: slot.senderTime,
        senderZone: slot.senderZone,
        localTime: slot.localTime,
        localDate: slot.localDate,
      });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }} data-testid="proposed-time-decision">
      <div
        style={{
          backgroundColor: theme.colors.background.default,
          borderRadius: theme.borderRadius.sm,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <div style={{ fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
          {summary}
        </div>
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            marginTop: theme.spacing.xs,
            color: isFree ? theme.colors.accent.success : theme.colors.accent.error,
          }}
        >
          {isFree ? t(`${KEY_PREFIX}.free`) : t(`${KEY_PREFIX}.busy`)}
        </div>
        {!isFree && <ConflictingEventsList events={proposal.conflictingEvents ?? []} />}
      </div>

      {!isFree && <AlternativeSlotList slots={alternatives} userTimezone={proposal.userTimezone} />}

      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {isFree && (
          <button type="button" onClick={onAccept} disabled={accepting} style={primaryButtonStyle}>
            {accepting ? t(`${KEY_PREFIX}.accepting`) : t(`${KEY_PREFIX}.accept`)}
          </button>
        )}
        {canSuggest && (
          <button type="button" onClick={onSuggestAnother} style={isFree ? secondaryButtonStyle : primaryButtonStyle}>
            {t(`${KEY_PREFIX}.suggestAnother`)}
          </button>
        )}
      </div>

      {acceptFailed && (
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>
          {t(`${KEY_PREFIX}.acceptFailed`)}
        </div>
      )}

      <button type="button" onClick={onEditDetails} style={linkButtonStyle}>
        {t(`${KEY_PREFIX}.editDetails`)}
      </button>
    </div>
  );
};
