import React from 'react';
import DOMPurify from 'dompurify';
import { theme } from '../../theme/theme';

interface EmailDetailBodyProps {
  body: string;
  htmlBody?: string;
}

/**
 * Email detail body component
 * Displays sanitized email body content
 */
export const EmailDetailBody: React.FC<EmailDetailBodyProps> = ({ body, htmlBody }) => {
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

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        dangerouslySetInnerHTML={{
          __html: htmlBody
            ? DOMPurify.sanitize(removeSignature(htmlBody))
            : removeSignature(body || ''),
        }}
        style={{
          color: theme.colors.text.primary,
          lineHeight: 1.8,
        }}
      />
    </div>
  );
};

