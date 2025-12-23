import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme/theme';
import { humanizeTimestamp } from '../../utils/dateUtils';

interface EmailDetailHeaderProps {
  emailId: string;
  subject: string;
  from: string;
  fromName?: string;
  receivedAt: string;
}

/**
 * Email detail header component
 * Displays email subject, sender, and timestamp
 */
export const EmailDetailHeader: React.FC<EmailDetailHeaderProps> = ({
  emailId,
  subject,
  from,
  fromName,
  receivedAt,
}) => {
  const navigate = useNavigate();

  return (
    <div style={{ marginBottom: theme.spacing.xl }}>
      <button
        onClick={() => navigate(`/email/${emailId}`)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary.main,
          color: 'white',
          border: 'none',
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.md,
        }}
      >
        Open in full view →
      </button>

      <h1
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {subject || '(No subject)'}
      </h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ color: theme.colors.text.primary }}>
            {fromName || from}
          </strong>
          <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
            {from}
          </span>
        </div>
        <span style={{ color: theme.colors.text.tertiary }}>
          {humanizeTimestamp(new Date(receivedAt))}
        </span>
      </div>
    </div>
  );
};

