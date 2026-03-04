import React from 'react';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { FollowUpActionsError } from 'components/inbox/FollowUpActionsError';
import { FollowUpActionsHeader } from 'components/inbox/FollowUpActionsHeader';

interface FollowUpActionsProps {
  onGenerateDrafts: () => void;
  isGenerating: boolean;
  error: string | null;
  onRetry?: () => void;
}

export const FollowUpActions: React.FC<FollowUpActionsProps> = ({
  onGenerateDrafts,
  isGenerating,
  error,
  onRetry,
}) => {
  const handleGenerateClick = () => {
    captureEvent('bulk_followups_generate_clicked');
    onGenerateDrafts();
  };

  return (
    <div style={{
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <FollowUpActionsHeader
        onGenerateDrafts={handleGenerateClick}
        isGenerating={isGenerating}
      />
      {error && (
        <FollowUpActionsError error={error} onRetry={onRetry} />
      )}
    </div>
  );
};

