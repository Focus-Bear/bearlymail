import React from 'react';
import { theme } from 'theme/theme';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';
import { ThreadMetadata } from 'components/inbox/followup/ThreadMetadata';
import { StatusBadge } from 'components/inbox/followup/StatusBadge';

interface FollowUpCardHeaderProps {
  thread: ThreadWithFollowUp;
  isGenerating: boolean;
  hasError: boolean;
}

export const FollowUpCardHeader: React.FC<FollowUpCardHeaderProps> = ({
  thread,
  isGenerating,
  hasError,
}) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
      <div style={{ flex: 1 }}>
        <h4 style={{
          margin: 0,
          marginBottom: theme.spacing.xs,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {thread.subject}
        </h4>
        <ThreadMetadata thread={thread} />
      </div>
      
      <StatusBadge isGenerating={isGenerating} hasError={hasError} />
    </div>
  );
};





