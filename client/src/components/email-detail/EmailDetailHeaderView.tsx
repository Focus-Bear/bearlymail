/**
 * EmailDetailHeaderView — presentational component extracted from EmailDetailHeader.
 *
 * All data and callbacks are passed as props; no hooks, no side-effects, no router/auth deps.
 * Directly importable in Storybook without any provider setup.
 *
 * The container `EmailDetailHeader` wraps this component and injects the hook-derived values.
 */
import React from 'react';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';

import { EMOJI_EMAIL, EMOJI_USER } from 'constants/emojis';

import { EmailDetailPriorityPanel } from './EmailDetailPriorityPanel';

export interface PriorityExplanation {
  score: number;
  breakdown: Array<{ factor: string; value: number; description: string }>;
  dimensions?: {
    goalAlignment?: { score: number; reasons: string[] };
    urgency?: { score: number; reasons: string[] };
    vipContact?: { score: number; reasons: string[] };
  };
}

export interface Correspondent {
  name: string;
  email: string;
  timestamp: number | string;
}

const COPY_ICON = '⧉';
const KEY_ENTER = 'Enter';
const KEY_SPACE = ' ';

export interface EmailDetailHeaderViewProps {
  email: Email;
  correspondent: Correspondent;
  priorityExplanation: PriorityExplanation | null;
  emailCopied: boolean;
  /** Fetches/recalculates the priority explanation — used as a retry when priority is unresolved. */
  onFetchPriorityExplanation: () => void;
  onNavigateToContact: (event: React.SyntheticEvent, contactEmail: string, senderContactId?: string | null) => void;
  onCopyEmail: () => void;
  onNavigateToSettings?: () => void;
  // i18n strings (passed as plain strings so the view has zero i18n dep)
  t: (key: string, options?: Record<string, unknown>) => string;
}

export const EmailDetailHeaderView: React.FC<EmailDetailHeaderViewProps> = ({
  email,
  correspondent,
  priorityExplanation,
  emailCopied,
  onFetchPriorityExplanation,
  onNavigateToContact,
  onCopyEmail,
  onNavigateToSettings,
  t,
}) => {
  return (
    <div style={{ marginBottom: 0 }}>
      <h1
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
          marginTop: 0,
          lineHeight: theme.typography.lineHeight.tight,
        }}
      >
        {EMOJI_EMAIL} {email.subject}
      </h1>

      <EmailDetailPriorityPanel
        email={email}
        priorityExplanation={priorityExplanation}
        onRecalculate={onFetchPriorityExplanation}
        onNavigateToSettings={onNavigateToSettings}
        t={t}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <div
            role="button"
            tabIndex={0}
            onClick={event => onNavigateToContact(event, correspondent.email, email.senderContactId)}
            onKeyDown={event => {
              if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
                onNavigateToContact(event, correspondent.email, email.senderContactId);
              }
            }}
            title={t('emailDetail.viewContact')}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: theme.colors.primary.subtle,
              color: theme.colors.primary.main,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: theme.typography.fontWeight.bold,
              fontSize: theme.typography.fontSize.lg,
              cursor: 'pointer',
            }}
          >
            {correspondent.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div
              style={{
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <span
                role="button"
                tabIndex={0}
                onClick={event => onNavigateToContact(event, correspondent.email, email.senderContactId)}
                onKeyDown={event => {
                  if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
                    onNavigateToContact(event, correspondent.email, email.senderContactId);
                  }
                }}
                title={t('emailDetail.viewContact')}
                style={{ cursor: 'pointer' }}
              >
                {EMOJI_USER} {correspondent.name}
              </span>
              {correspondent.email && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                  }}
                >
                  <span
                    onClick={onCopyEmail}
                    title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                    style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                      fontWeight: theme.typography.fontWeight.normal,
                      cursor: 'pointer',
                    }}
                  >
                    &lt;{correspondent.email}&gt;
                  </span>
                  <button
                    type="button"
                    onClick={onCopyEmail}
                    title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                    aria-label={t('emailDetail.clickToCopyEmail')}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.lg,
                      lineHeight: 1,
                    }}
                  >
                    {COPY_ICON}
                  </button>
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: theme.typography.fontSize.lg,
                color: theme.colors.text.primary,
                opacity: 0.8,
              }}
              title={new Date(correspondent.timestamp).toLocaleString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            >
              {humanizeTimestamp(correspondent.timestamp as string)}
            </div>
            {email.to && (
              <div
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  marginTop: theme.spacing.xs,
                }}
              >
                <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{t('emailDetail.toLabel')}</span>{' '}
                {email.to}
              </div>
            )}
            {email.cc && (
              <div
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  marginTop: theme.spacing.xs,
                }}
              >
                <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{t('emailDetail.ccLabel')}</span>{' '}
                {email.cc}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
