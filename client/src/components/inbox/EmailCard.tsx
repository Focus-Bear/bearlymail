import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { PriorityTooltip } from '../priority/PriorityTooltip';
import axios from 'axios';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  priorityScore: number;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  receivedAt: string;
  isProcessingPriority?: boolean;
  isProcessingSummary?: boolean;
  summary?: string | null;
  isStarred?: boolean;
  starCount?: number; // Thread-level property (0-3)
  isArchived?: boolean; // Thread-level property
  labels?: string[];
}

interface EmailCardProps {
  email: Email;
  mode: 'triage' | 'process';
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  onMarkAsRead: (emailId: string) => void;
  onToggleStar: (emailId: string, e: React.MouseEvent) => void;
  onArchive: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => void;
  snoozeInput: string;
  showSnoozeInput: boolean;
  onSnoozeInputChange: (value: string) => void;
  onShowSnoozeInput: (emailId: string) => void;
  onHideSnoozeInput: () => void;
}

export const EmailCard: React.FC<EmailCardProps> = ({
  email,
  mode,
  priorityLabel,
  priorityColor,
  priorityBg,
  onMarkAsRead,
  onToggleStar,
  onArchive,
  onSnooze,
  snoozeInput,
  showSnoozeInput,
  onSnoozeInputChange,
  onShowSnoozeInput,
  onHideSnoozeInput,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const extractPreview = (body: string): string => {
    const firstSentenceMatch = body.match(/^[^.!?]+[.!?]/);
    if (firstSentenceMatch) {
      return firstSentenceMatch[0].trim();
    }
    return body.substring(0, 150).replace(/[\r\n]+/g, ' ') + '...';
  };

  return (
    <div
      onClick={() => {
        onMarkAsRead(email.id);
        navigate(`/email/${email.id}`);
      }}
      className="animate-fade-in"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        border: `1px solid ${email.isRead ? theme.colors.border.light : theme.colors.primary.light}`,
        borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${theme.colors.primary.main}`,
        boxShadow: theme.shadows.sm,
        cursor: 'pointer',
        transition: theme.transitions.default,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = theme.shadows.md;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = theme.shadows.sm;
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <strong style={{
            color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
          }}>
            {email.fromName || email.from}
          </strong>
          <PriorityTooltip
            emailId={email.id}
            priorityScore={email.priorityScore}
            onOverride={async (explanation: string) => {
              try {
                await axios.post(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/priority/star-feedback`, {
                  emailId: email.id,
                  userStarCount: email.starCount || 0,
                  predictedStarCount: Math.round((email.priorityScore / 100) * 3),
                  explanation,
                });
              } catch (error) {
                console.error('Error submitting override:', error);
              }
            }}
          >
            <span style={{
              fontSize: theme.typography.fontSize.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: priorityBg,
              color: priorityColor,
              borderRadius: theme.borderRadius.full,
              fontWeight: theme.typography.fontWeight.medium,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              cursor: 'help',
            }}>
              {email.isProcessingPriority ? (
                <>
                  <span style={{ 
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    border: `2px solid ${priorityColor}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  {t('email.calculating')}
                </>
              ) : (
                `🎯 ${priorityLabel} (${email.priorityScore.toFixed(0)})`
              )}
            </span>
          </PriorityTooltip>

          {/* Labels */}
          {email.labels && email.labels.length > 0 && (
            <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
              {email.labels
                .filter(label => !['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'TRASH', 'SPAM'].includes(label))
                .map((label, i) => {
                  const displayLabel = label.startsWith('CATEGORY_') ? label.replace('CATEGORY_', '') : label;
                  const isCategory = label.startsWith('CATEGORY_');
                  return (
                    <span key={i} style={{
                      fontSize: theme.typography.fontSize.xs,
                      padding: `2px ${theme.spacing.sm}`,
                      backgroundColor: isCategory ? theme.colors.background.subtle : theme.colors.primary.subtle,
                      color: isCategory ? theme.colors.text.secondary : theme.colors.primary.main,
                      borderRadius: theme.borderRadius.sm,
                      border: `1px solid ${isCategory ? theme.colors.border.light : 'transparent'}`,
                      textTransform: isCategory ? 'capitalize' : 'none',
                    }}>
                      {displayLabel.toLowerCase()}
                    </span>
                  );
                })}
            </div>
          )}
        </div>
        <span style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}>
          {new Date(email.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{
        color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
        marginBottom: theme.spacing.sm,
      }}>
        {email.subject}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '600px',
          lineHeight: theme.typography.lineHeight.relaxed,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          {email.isProcessingSummary ? (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.text.tertiary}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              {t('email.generatingSummary')}
            </>
          ) : email.summary ? (
            email.summary
          ) : (
            <span
              title={email.body.substring(0, 1000).replace(/[\r\n]+/g, ' ')}
              style={{ cursor: 'help' }}
            >
              {extractPreview(email.body)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.sm }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => onToggleStar(email.id, e)}
            title={t('emailActions.toggleStar')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 4px',
              color: email.isStarred ? theme.colors.accent.warning : theme.colors.text.tertiary,
            }}
          >
            {email.isStarred ? '⭐' : '☆'}
          </button>
          <button
            onClick={(e) => onArchive(email.id, e)}
            title={t('emailActions.archive')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 4px',
              color: theme.colors.text.tertiary,
            }}
          >
            📥
          </button>

          {showSnoozeInput ? (
            <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
              <input
                type="text"
                placeholder={t('emailActions.snoozePlaceholder')}
                autoFocus
                value={snoozeInput}
                onChange={(e) => onSnoozeInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (snoozeInput.trim()) {
                      onSnooze(email.id);
                    }
                  }
                  if (e.key === 'Escape') {
                    onHideSnoozeInput();
                  }
                }}
                style={{
                  padding: theme.spacing.xs,
                  borderRadius: theme.borderRadius.sm,
                  border: `1px solid ${theme.colors.primary.main}`,
                  fontSize: theme.typography.fontSize.sm,
                  width: '100px',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  if (snoozeInput.trim()) {
                    onSnooze(email.id);
                  }
                }}
                disabled={!snoozeInput.trim()}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  borderRadius: theme.borderRadius.sm,
                  backgroundColor: snoozeInput.trim() ? theme.colors.primary.main : theme.colors.background.subtle,
                  color: snoozeInput.trim() ? 'white' : theme.colors.text.tertiary,
                  border: 'none',
                  cursor: snoozeInput.trim() ? 'pointer' : 'not-allowed',
                  fontSize: theme.typography.fontSize.xs,
                  fontWeight: theme.typography.fontWeight.medium,
                  opacity: snoozeInput.trim() ? 1 : 0.6,
                }}
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={onHideSnoozeInput}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  borderRadius: theme.borderRadius.sm,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.xs,
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => onShowSnoozeInput(email.id)}
              style={{
                color: theme.colors.text.tertiary,
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.medium,
                padding: theme.spacing.xs,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = theme.colors.primary.main}
              onMouseLeave={(e) => e.currentTarget.style.color = theme.colors.text.tertiary}
            >
              {t('emailActions.snooze')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};



