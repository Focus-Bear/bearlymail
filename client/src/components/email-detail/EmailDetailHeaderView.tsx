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
import { Email, getEmailPriorityScore } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';

import {
  EMOJI_EMAIL,
  EMOJI_GOAL,
  EMOJI_NEGATIVE,
  EMOJI_NEUTRAL,
  EMOJI_POSITIVE,
  EMOJI_SETTINGS,
  EMOJI_USER,
} from 'constants/emojis';
import { PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD } from 'constants/numbers';

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
const SENTIMENT_KEYWORD = 'sentiment';
const KEY_ENTER = 'Enter';
const KEY_SPACE = ' ';

export interface EmailDetailHeaderViewProps {
  email: Email;
  correspondent: Correspondent;
  priorityExplanation: PriorityExplanation | null;
  showPriorityExplanation: boolean;
  emailCopied: boolean;
  onFetchPriorityExplanation: () => void;
  onClosePriorityExplanation: () => void;
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
  showPriorityExplanation,
  emailCopied,
  onFetchPriorityExplanation,
  onClosePriorityExplanation,
  onNavigateToContact,
  onCopyEmail,
  onNavigateToSettings,
  t,
}) => {
  const getSentimentLabel = (value: number) => {
    if (value > 0) {
      return `${EMOJI_NEGATIVE} ${t('emailDetail.sentiment.negative')}`;
    }
    if (value < 0) {
      return `${EMOJI_POSITIVE} ${t('emailDetail.sentiment.positive')}`;
    }
    return `${EMOJI_NEUTRAL} ${t('emailDetail.sentiment.neutral')}`;
  };

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
        <div
          onClick={onFetchPriorityExplanation}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.full,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            position: 'relative',
          }}
          title={t('emailDetail.clickToSeeScore')}
        >
          {t('emailDetail.priorityScore', { score: getEmailPriorityScore(email).toFixed(0) })}

          {priorityExplanation && priorityExplanation.dimensions && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: theme.spacing.xs,
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.light}`,
                fontSize: theme.typography.fontSize.sm,
                minWidth: '200px',
                boxShadow: theme.shadows.md,
                zIndex: 999,
              }}
            >
              {priorityExplanation.dimensions.goalAlignment && (
                <div style={{ marginBottom: theme.spacing.xs }}>
                  <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
                    {EMOJI_GOAL} {t('emailDetail.goalAlignment')}:{' '}
                  </span>
                  <span>{priorityExplanation.dimensions.goalAlignment.score.toFixed(0)}%</span>
                  {priorityExplanation.dimensions.goalAlignment.reasons.length > 0 && (
                    <div
                      style={{
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.secondary,
                        marginTop: '2px',
                      }}
                    >
                      {priorityExplanation.dimensions.goalAlignment.reasons[0]}
                    </div>
                  )}
                </div>
              )}
              {priorityExplanation.breakdown &&
                (() => {
                  const sentimentItem = priorityExplanation.breakdown.find(
                    item =>
                      item.factor.toLowerCase().includes(SENTIMENT_KEYWORD) ||
                      item.description.toLowerCase().includes(SENTIMENT_KEYWORD)
                  );
                  if (sentimentItem) {
                    const sentimentLabel = getSentimentLabel(sentimentItem.value);
                    return (
                      <div>
                        <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
                          {sentimentLabel} {t('emailDetail.sentiment.label')}:{' '}
                        </span>
                        <span>{sentimentItem.description}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
            </div>
          )}

          {showPriorityExplanation && priorityExplanation && (
            <div
              onClick={event => event.stopPropagation()}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: theme.spacing.sm,
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.lg,
                padding: theme.spacing.lg,
                zIndex: 1000,
                width: '300px',
                border: `1px solid ${theme.colors.border.light}`,
                cursor: 'default',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: theme.spacing.md,
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: theme.typography.fontSize.base,
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}
                >
                  {t('emailDetail.scoreBreakdown')}
                </h4>
                <button
                  onClick={event => {
                    event.stopPropagation();
                    onClosePriorityExplanation();
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {priorityExplanation.breakdown && priorityExplanation.breakdown.length > 0 && (
                <div
                  style={{
                    marginBottom: theme.spacing.md,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.sm,
                    fontSize: theme.typography.fontSize.lg,
                    lineHeight: theme.typography.lineHeight.relaxed,
                  }}
                >
                  <strong style={{ color: theme.colors.text.primary }}>
                    {(() => {
                      if (priorityExplanation.score > PRIORITY_HIGH_THRESHOLD) {
                        return t('priority.high');
                      }
                      if (priorityExplanation.score >= PRIORITY_MEDIUM_THRESHOLD) {
                        return t('priority.medium');
                      }
                      if (priorityExplanation.score >= 0) {
                        return t('priority.low');
                      }
                      return t('priority.veryLow');
                    })()}{' '}
                    {t('emailDetail.priorityBecause')}:
                  </strong>{' '}
                  {priorityExplanation.breakdown
                    .filter(item => item.value > 0)
                    .slice(0, 3)
                    .map((item, idx, items) => (
                      <span key={`${item.factor}-${item.value}`}>
                        {item.description.toLowerCase() || item.factor.toLowerCase()} ({item.value > 0 ? '+' : ''}
                        {item.value}){idx < items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                </div>
              )}

              <div style={{ marginBottom: theme.spacing.md }}>
                {priorityExplanation.breakdown &&
                  priorityExplanation.breakdown.map(item => (
                    <div
                      key={`${item.factor}-${item.value}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: theme.spacing.xs,
                        fontSize: theme.typography.fontSize.lg,
                      }}
                    >
                      <span
                        title={item.description}
                        style={{ cursor: 'help', borderBottom: `1px dotted ${theme.colors.border.medium}` }}
                      >
                        {item.factor}
                      </span>
                      <span
                        style={{
                          fontWeight: item.value > 0 ? 'bold' : 'normal',
                          color: item.value > 0 ? theme.colors.accent.success || 'green' : 'inherit',
                        }}
                      >
                        {item.value > 0 ? '+' : ''}
                        {item.value}
                      </span>
                    </div>
                  ))}
                <div
                  style={{
                    borderTop: `1px solid ${theme.colors.border.light}`,
                    marginTop: theme.spacing.sm,
                    paddingTop: theme.spacing.sm,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 'bold',
                  }}
                >
                  <span>{t('emailDetail.totalScore')}</span>
                  <span>{priorityExplanation.score}</span>
                </div>
              </div>

              <button
                onClick={event => {
                  event.stopPropagation();
                  onNavigateToSettings?.();
                }}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.primary.subtle,
                  color: theme.colors.primary.main,
                  border: 'none',
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.medium,
                }}
              >
                {EMOJI_SETTINGS} {t('emailDetail.tweakRules')}
              </button>
            </div>
          )}

          {showPriorityExplanation && (
            <div
              onClick={event => {
                event.stopPropagation();
                onClosePriorityExplanation();
              }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999,
                cursor: 'default',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
