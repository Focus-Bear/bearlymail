import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { Email } from '../../types/email';
import { PriorityTooltip } from '../priority/PriorityTooltip';
import { getPriorityBadge } from '../../utils/priorityUtils';
import { GitHubStatusBadges } from '../github/GitHubStatusBadges';

interface EmailCardHeaderProps {
  email: Email;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: any;
    loadingPriorityExplanation: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
  };
  onOverrideUrgency?: () => void;
}

export const EmailCardHeader: React.FC<EmailCardHeaderProps> = ({
  email,
  priorityTooltip,
  onOverrideUrgency,
}) => {
  const { t } = useTranslation();
  const priority = getPriorityBadge(email.priorityScore, t);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <strong style={{
          color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
        }}>
          {email.fromName || email.from}
        </strong>
        
        {/* Priority Badge */}
        <span 
          data-priority-badge={email.id}
          style={{
            fontSize: theme.typography.fontSize.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: priority.bg,
            color: priority.color,
            borderRadius: theme.borderRadius.full,
            fontWeight: theme.typography.fontWeight.medium,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            cursor: 'pointer',
            position: 'relative',
            zIndex: 10,
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (email.isProcessingPriority) return;
            priorityTooltip.togglePriorityTooltip(email.id);
          }}
        >
          {email.isProcessingPriority ? (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '10px',
                height: '10px',
                border: `2px solid ${priority.color}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              🔄 {t('email.calculating')}
            </>
          ) : (
            `${priority.label} (${email.priorityScore.toFixed(0)})`
          )}
          
          {/* Priority Tooltip */}
          {priorityTooltip.hoveredPriorityEmailId === email.id && (
            <PriorityTooltip
              emailId={email.id}
              emailThreadId={email.emailThreadId}
              priorityExplanation={priorityTooltip.priorityExplanation}
              loadingPriorityExplanation={priorityTooltip.loadingPriorityExplanation}
              urgencyScore={email.urgencyScore}
              urgencyExplanation={email.urgencyExplanation}
              onClose={priorityTooltip.hidePriorityTooltip}
              onOverrideUrgency={onOverrideUrgency}
            />
          )}
        </span>

        {/* Urgency Indicator */}
        {email.urgencyScore !== undefined && email.urgencyScore >= 90 && (
          <span
            title={email.urgencyExplanation || 'High urgency email'}
            style={{
              fontSize: theme.typography.fontSize.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.accent.error,
              color: '#fff',
              borderRadius: theme.borderRadius.full,
              fontWeight: theme.typography.fontWeight.semibold,
              display: 'inline-flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              cursor: 'help',
            }}
          >
            🚨 Urgent ({email.urgencyScore.toFixed(0)})
          </span>
        )}
        
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
                    color: theme.colors.text.secondary,
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

        {/* GitHub Status Badges */}
        <GitHubStatusBadges links={email.githubMetadata?.links || []} />
      </div>
      
      <span style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
      }}>
        {new Date(email.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

