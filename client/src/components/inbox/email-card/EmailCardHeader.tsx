import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../../theme/theme';

interface EmailCardHeaderProps {
  from: string;
  fromName?: string;
  isRead: boolean;
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  priorityScore: number;
  isProcessingPriority: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  labels?: string[];
  receivedAt: string;
}

/**
 * Email card header component
 * Displays sender, priority, urgency, labels, and timestamp
 */
export const EmailCardHeader: React.FC<EmailCardHeaderProps> = ({
  from,
  fromName,
  isRead,
  priorityLabel,
  priorityColor,
  priorityBg,
  priorityScore,
  isProcessingPriority,
  urgencyScore,
  urgencyExplanation,
  labels,
  receivedAt,
}) => {
  const { t } = useTranslation();

  const getLabelKey = (label: string, index: number): string => {
    return `label-${label}-${index}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.xs,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <strong
          style={{
            color: isRead ? theme.colors.text.secondary : theme.colors.text.primary,
            fontSize: theme.typography.fontSize.base,
            fontWeight: isRead
              ? theme.typography.fontWeight.normal
              : theme.typography.fontWeight.semibold,
          }}
        >
          {fromName || from}
        </strong>
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: priorityBg,
            color: priorityColor,
            borderRadius: theme.borderRadius.full,
            fontWeight: theme.typography.fontWeight.medium,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            cursor: 'help',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
          }}
        >
          {isProcessingPriority ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  border: `2px solid ${priorityColor}`,
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              {t('email.calculating')}
            </>
          ) : (
            `${priorityLabel} (${priorityScore.toFixed(0)})`
          )}
        </span>

        {urgencyScore !== undefined && urgencyScore >= 90 && (
          <span
            title={urgencyExplanation || 'High urgency email'}
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
            🚨 Urgent ({urgencyScore.toFixed(0)})
          </span>
        )}

        {labels && labels.length > 0 && (
          <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            {labels
              .filter(
                (label) =>
                  !['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'TRASH', 'SPAM'].includes(
                    label
                  )
              )
              .map((label, index) => {
                const displayLabel = label.startsWith('CATEGORY_')
                  ? label.replace('CATEGORY_', '')
                  : label;
                const isCategory = label.startsWith('CATEGORY_');
                return (
                  <span
                    key={getLabelKey(label, index)}
                    style={{
                      fontSize: theme.typography.fontSize.xs,
                      padding: `2px ${theme.spacing.sm}`,
                      backgroundColor: isCategory
                        ? theme.colors.background.subtle
                        : theme.colors.primary.subtle,
                      color: isCategory
                        ? theme.colors.text.secondary
                        : theme.colors.primary.main,
                      borderRadius: theme.borderRadius.sm,
                      border: `1px solid ${
                        isCategory ? theme.colors.border.light : 'transparent'
                      }`,
                      textTransform: isCategory ? 'capitalize' : 'none',
                    }}
                  >
                    {displayLabel.toLowerCase()}
                  </span>
                );
              })}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {new Date(receivedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
};

