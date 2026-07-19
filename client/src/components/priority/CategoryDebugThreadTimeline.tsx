import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import type { CategoryDebugThreadEmail, CategoryDecisionAnalyzedEmail } from './CategoryDebugModal.types';

// Defensive theme access (matches the surrounding debug components).
const MUTED_COLOR = theme.colors.text.secondary;
const BORDER_COLOR = theme.colors.border?.light ?? theme.colors.border?.default ?? theme.colors.text.secondary;
const ACCENT_COLOR = theme.colors.primary?.main ?? theme.colors.text.primary;
const WARN_COLOR = theme.colors.warning?.main ?? theme.colors.error?.main ?? theme.colors.text.primary;

interface CategoryDebugThreadTimelineProps {
  threadEmails: CategoryDebugThreadEmail[];
  /** The email the STORED category decision was computed from, when known. */
  analyzedEmail: CategoryDecisionAnalyzedEmail | null | undefined;
}

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: theme.typography.fontWeight.semibold,
  textTransform: 'uppercase',
  borderRadius: theme.borderRadius.sm,
  padding: '1px 6px',
  whiteSpace: 'nowrap',
};

const Badge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span style={{ ...badgeStyle, color, border: `1px solid ${color}` }}>{label}</span>
);

/**
 * Renders the thread's emails as a timeline (oldest first), marking which email
 * the debug view was opened from, which is the thread's latest, and — crucially
 * — which single email the stored category decision was computed from. The
 * categoriser only analyses ONE email's content per run, so a category that
 * looks wrong is very often one computed from an earlier message; this panel
 * makes that visible at a glance.
 */
export const CategoryDebugThreadTimeline: React.FC<CategoryDebugThreadTimelineProps> = ({
  threadEmails,
  analyzedEmail,
}) => {
  const { t } = useTranslation();

  if (threadEmails.length === 0) {
    return null;
  }

  const analyzedInTimeline = analyzedEmail
    ? threadEmails.some(entry => entry.emailId === analyzedEmail.emailId)
    : false;
  const analyzedIsStale = analyzedEmail?.wasLatestInThread === false;

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${BORDER_COLOR}`,
      }}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('priority.categoryDebug.threadTimeline.title', { count: threadEmails.length })}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: MUTED_COLOR,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('priority.categoryDebug.threadTimeline.singleEmailNote')}
      </div>
      {analyzedEmail && !analyzedInTimeline ? (
        <div
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: WARN_COLOR,
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('priority.categoryDebug.threadTimeline.analyzedEmailMissing')}
        </div>
      ) : null}
      {threadEmails.map(entry => {
        const isAnalyzed = analyzedEmail?.emailId === entry.emailId;
        return (
          <div
            key={entry.emailId}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: theme.spacing.xs,
              fontSize: theme.typography.fontSize.xs,
              padding: `${theme.spacing.xs} 0`,
              borderTop: `1px solid ${BORDER_COLOR}`,
            }}
          >
            <span style={{ color: MUTED_COLOR, whiteSpace: 'nowrap' }}>
              {entry.receivedAt
                ? new Date(entry.receivedAt).toLocaleString()
                : t('priority.categoryDebug.threadTimeline.noDate')}
            </span>
            <strong style={{ whiteSpace: 'nowrap' }}>{entry.fromName || entry.from}</strong>
            <span style={{ color: MUTED_COLOR, flex: 1, minWidth: 120, wordBreak: 'break-word' }}>
              {entry.subject}
            </span>
            {isAnalyzed ? (
              <Badge
                label={t('priority.categoryDebug.threadTimeline.badgeAnalyzed')}
                color={analyzedIsStale ? WARN_COLOR : ACCENT_COLOR}
              />
            ) : null}
            {entry.isLatest ? (
              <Badge label={t('priority.categoryDebug.threadTimeline.badgeLatest')} color={MUTED_COLOR} />
            ) : null}
            {entry.isDebugTarget ? (
              <Badge label={t('priority.categoryDebug.threadTimeline.badgeViewing')} color={MUTED_COLOR} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
