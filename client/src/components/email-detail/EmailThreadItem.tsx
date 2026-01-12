import React from 'react';
import { theme } from 'theme/theme';
import { ThreadItemHeader } from 'components/email-detail/ThreadItemHeader';
import { ThreadItemBody } from 'components/email-detail/ThreadItemBody';

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
        receivedAt={threadEmail.receivedAt}
        isExpanded={isExpanded}
        isCurrentEmail={isCurrentEmail}
        onToggle={onToggle}
      />
      {isExpanded && (
        <ThreadItemBody
          body={threadEmail.body}
          htmlBody={threadEmail.htmlBody}
        />
      )}
    </div>
  );
};

