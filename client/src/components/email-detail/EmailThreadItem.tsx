import React from 'react';
import { theme } from 'theme/theme';

import { EmailAttachments } from 'components/email-detail/EmailAttachments';
import { ThreadItemBody } from 'components/email-detail/ThreadItemBody';
import { ThreadItemHeader } from 'components/email-detail/ThreadItemHeader';

interface EmailThreadItemProps {
  threadEmail: {
    id: string;
    from: string;
    fromName?: string;
    to?: string;
    cc?: string;
    body: string;
    htmlBody?: string;
    receivedAt: string;
    attachments?: Array<{
      attachmentId: string;
      filename: string;
      mimeType: string;
      size: number;
      contentId?: string;
      inlineData?: string;
    }>;
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
  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
      }}
    >
      <ThreadItemHeader
        from={threadEmail.from}
        fromName={threadEmail.fromName}
        to={threadEmail.to}
        cc={threadEmail.cc}
        receivedAt={threadEmail.receivedAt}
        isExpanded={isExpanded}
        isCurrentEmail={isCurrentEmail}
        onToggle={onToggle}
      />
      {isExpanded && (
        <>
          <ThreadItemBody body={threadEmail.body} htmlBody={threadEmail.htmlBody} attachments={threadEmail.attachments} />
          {Array.isArray(threadEmail.attachments) && threadEmail.attachments.length > 0 && (
            <div style={{ padding: `0 ${theme.spacing.md} ${theme.spacing.md}` }}>
              <EmailAttachments emailId={threadEmail.id} attachments={threadEmail.attachments} />
            </div>
          )}
        </>
      )}
    </div>
  );
};