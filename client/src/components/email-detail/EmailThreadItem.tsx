import React from 'react';
import DOMPurify from 'dompurify';
import { theme } from '../../theme/theme';
import { humanizeTimestamp } from '../../utils/dateUtils';

interface EmailThreadItemProps {
  threadEmail: {
    id: string;
    from: string;
    fromName?: string;
    body: string;
    htmlBody?: string;
    receivedAt: string;
  };
  isExpanded: boolean;
  isCurrentEmail: boolean;
  onToggle: () => void;
}

/**
 * Email thread item component
 * Displays individual email in a thread
 */
export const EmailThreadItem: React.FC<EmailThreadItemProps> = ({
  threadEmail,
  isExpanded,
  isCurrentEmail,
  onToggle,
}) => {
  const removeSignature = (text: string): string => {
    if (!text) return '';

    const patterns = [
      /^--\s*$/m,
      /^Best regards,?$/mi,
      /^Sent from .+$/mi,
      /^On .+ wrote:?$/mi,
      /\n-{3,}\n/,
      /RMIT University/i,
      /getoutline\.org/i,
    ];

    let signatureStart = text.length;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined && match.index < signatureStart) {
        signatureStart = match.index;
      }
    }

    return text.substring(0, signatureStart).trim();
  };

  const getBackgroundColor = (): string => {
    if (isCurrentEmail) return theme.colors.primary.subtle;
    return theme.colors.background.subtle;
  };

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: theme.spacing.md,
          backgroundColor: getBackgroundColor(),
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <strong style={{ color: theme.colors.text.primary }}>
            {threadEmail.fromName || threadEmail.from}
          </strong>
          <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
            {humanizeTimestamp(new Date(threadEmail.receivedAt))}
          </span>
        </div>
        <span style={{ color: theme.colors.text.tertiary }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.paper,
            borderTop: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: threadEmail.htmlBody
                ? DOMPurify.sanitize(removeSignature(threadEmail.htmlBody))
                : removeSignature(threadEmail.body || ''),
            }}
            style={{
              color: theme.colors.text.primary,
              lineHeight: 1.6,
            }}
          />
        </div>
      )}
    </div>
  );
};

