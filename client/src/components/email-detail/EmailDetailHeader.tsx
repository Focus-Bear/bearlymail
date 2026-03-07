import React, { useCallback,useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { getCorrespondent } from 'utils/emailUtils';

import { EMOJI_EMAIL, EMOJI_GOAL, EMOJI_NEGATIVE, EMOJI_NEUTRAL,EMOJI_POSITIVE, EMOJI_SETTINGS, EMOJI_USER } from 'constants/emojis';
import { PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD, SAVE_CONFIRMATION_DURATION_MS } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

interface PriorityExplanation {
  score: number;
  breakdown: Array<{ factor: string; value: number; description: string }>;
  dimensions?: {
    goalAlignment?: { score: number; reasons: string[] };
    urgency?: { score: number; reasons: string[] };
    vipContact?: { score: number; reasons: string[] };
  };
}

const COPY_ICON = '⧉';
const SENTIMENT_KEYWORD = 'sentiment';

interface EmailDetailHeaderProps {
  email: Email;
  threadEmails?: Email[];
  priorityExplanation: PriorityExplanation | null;
  showPriorityExplanation: boolean;
  onFetchPriorityExplanation: () => void;
  onClosePriorityExplanation: () => void;
}

// eslint-disable-next-line max-lines-per-function -- Email detail header requires handling multiple email metadata and UI states
export const EmailDetailHeader: React.FC<EmailDetailHeaderProps> = ({
  email,
  threadEmails = [],
  priorityExplanation,
  showPriorityExplanation,
  onFetchPriorityExplanation,
  onClosePriorityExplanation,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSuccess } = useNotifications();

  const correspondent = useMemo(() => {
    return getCorrespondent(email, user?.email, threadEmails);
  }, [email, threadEmails, user?.email]);

  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(correspondent.email);
      setEmailCopied(true);
      showSuccess(t('emailDetail.emailCopied'));
      setTimeout(() => setEmailCopied(false), SAVE_CONFIRMATION_DURATION_MS);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy email:', err);
    }
  }, [correspondent.email, showSuccess, t]);

  const getSentimentLabel = (value: number) => {
    if (value > 0) return `${EMOJI_NEGATIVE} ${t('emailDetail.sentiment.negative')}`;
    if (value < 0) return `${EMOJI_POSITIVE} ${t('emailDetail.sentiment.positive')}`;
    return `${EMOJI_NEUTRAL} ${t('emailDetail.sentiment.neutral')}`;
  };

  return (
    <div style={{ marginBottom: 0 }}>
      <h1 style={{
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.bold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        marginTop: 0,
        lineHeight: theme.typography.lineHeight.tight,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_EMAIL} {email.subject}
      </h1>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.border.light}`, paddingBottom: theme.spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <div style={{
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
          }}>
            {correspondent.name[0].toUpperCase()}
          </div>
                    <div>
                      <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                        {/* eslint-disable-next-line i18next/no-literal-string */}
                        {EMOJI_USER} {correspondent.name}
                        {correspondent.email && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: theme.spacing.xs,
                            }}
                          >
                            <span
                              onClick={handleCopyEmail}
                              title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                              style={{
                                fontSize: theme.typography.fontSize.xs,
                                color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                                fontWeight: theme.typography.fontWeight.normal,
                                cursor: 'pointer',
                              }}
                            >
                              {/* eslint-disable-next-line i18next/no-literal-string */}
                              &lt;{correspondent.email}&gt;
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyEmail}
                              title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
                              aria-label={t('emailDetail.clickToCopyEmail')}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                                fontSize: theme.typography.fontSize.sm,
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
                          fontSize: theme.typography.fontSize.sm, 
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
                        {humanizeTimestamp(correspondent.timestamp)}
                      </div>
                      {email.to && (
                        <div style={{ 
                          fontSize: theme.typography.fontSize.xs, 
                          color: theme.colors.text.secondary,
                          marginTop: theme.spacing.xs,
                        }}>
                          {/* eslint-disable-next-line i18next/no-literal-string */}
                          <span style={{ fontWeight: theme.typography.fontWeight.medium }}>To:</span> {email.to}
                        </div>
                      )}
                      {email.cc && (
                        <div style={{ 
                          fontSize: theme.typography.fontSize.xs, 
                          color: theme.colors.text.secondary,
                          marginTop: theme.spacing.xs,
                        }}>
                          {/* eslint-disable-next-line i18next/no-literal-string */}
                          <span style={{ fontWeight: theme.typography.fontWeight.medium }}>CC:</span> {email.cc}
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
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            position: 'relative',
          }}
          title={t('emailDetail.clickToSeeScore')}
        >
          {t('emailDetail.priorityScore', { score: getEmailPriorityScore(email).toFixed(0) })}
          
          {priorityExplanation && priorityExplanation.dimensions && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: theme.spacing.xs,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.light}`,
              fontSize: theme.typography.fontSize.xs,
              minWidth: '200px',
              boxShadow: theme.shadows.md,
              zIndex: 999,
            }}>
              {priorityExplanation.dimensions.goalAlignment && (
                <div style={{ marginBottom: theme.spacing.xs }}>
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{EMOJI_GOAL} {t('emailDetail.goalAlignment')}: </span>
                  <span>{priorityExplanation.dimensions.goalAlignment.score.toFixed(0)}%</span>
                  {priorityExplanation.dimensions.goalAlignment.reasons.length > 0 && (
                    <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginTop: '2px' }}>
                      {priorityExplanation.dimensions.goalAlignment.reasons[0]}
                    </div>
                  )}
                </div>
              )}
              {priorityExplanation.breakdown && (() => {
                const sentimentItem = priorityExplanation.breakdown.find(item => 
                  item.factor.toLowerCase().includes(SENTIMENT_KEYWORD) || item.description.toLowerCase().includes(SENTIMENT_KEYWORD)
                );
                if (sentimentItem) {
                  const sentimentLabel = getSentimentLabel(sentimentItem.value);
                  return (
                    <div>
                      <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{sentimentLabel} {t('emailDetail.sentiment.label')}: </span>
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
              onClick={(event) => event.stopPropagation()}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                <h4 style={{ margin: 0, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold }}>
                  {t('emailDetail.scoreBreakdown')}
                </h4>
                <button 
                  onClick={(event) => {
                    event.stopPropagation();
                    onClosePriorityExplanation();
                  }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                >
                  ×
                </button>
              </div>

              {priorityExplanation.breakdown && priorityExplanation.breakdown.length > 0 && (
                <div style={{ 
                  marginBottom: theme.spacing.md, 
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.background.subtle,
                  borderRadius: theme.borderRadius.sm,
                  fontSize: theme.typography.fontSize.sm,
                  lineHeight: theme.typography.lineHeight.relaxed,
                }}>
                  <strong style={{ color: theme.colors.text.primary }}>
                    {(() => {
                      // New calibration: < 0 = very low, 0-20 = low, 20-40 = medium, > 40 = high
                      if (priorityExplanation.score > PRIORITY_HIGH_THRESHOLD) return t('priority.high');
                      if (priorityExplanation.score >= PRIORITY_MEDIUM_THRESHOLD) return t('priority.medium');
                      if (priorityExplanation.score >= 0) return t('priority.low');
                      return t('priority.veryLow');
                    })()} {t('emailDetail.priorityBecause')}:
                  </strong>{' '}
                  {priorityExplanation.breakdown
                    .filter(item => item.value > 0)
                    .slice(0, 3)
                    .map((item, idx, items) => (
                      <span key={`${item.factor}-${item.value}`}>
                        {item.description.toLowerCase() || item.factor.toLowerCase()} ({item.value > 0 ? '+' : ''}{item.value})
                        {idx < items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                </div>
              )}
              
              <div style={{ marginBottom: theme.spacing.md }}>
                {priorityExplanation.breakdown && priorityExplanation.breakdown.map((item) => (
                  <div key={`${item.factor}-${item.value}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                    <span title={item.description} style={{ cursor: 'help', borderBottom: `1px dotted ${theme.colors.border.medium}` }}>
                      {item.factor}
                    </span>
                    <span style={{ fontWeight: item.value > 0 ? 'bold' : 'normal', color: item.value > 0 ? theme.colors.accent.success || 'green' : 'inherit' }}>
                      {item.value > 0 ? '+' : ''}{item.value}
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>{t('emailDetail.totalScore')}</span>
                  <span>{priorityExplanation.score}</span>
                </div>
              </div>
              
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  navigate('/settings');
                }}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.primary.subtle,
                  color: theme.colors.primary.main,
                  border: 'none',
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.xs,
                  fontWeight: theme.typography.fontWeight.medium,
                }}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                {EMOJI_SETTINGS} {t('emailDetail.tweakRules')}
              </button>
            </div>
          )}
          
          {showPriorityExplanation && (
            <div 
              onClick={(event) => {
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
