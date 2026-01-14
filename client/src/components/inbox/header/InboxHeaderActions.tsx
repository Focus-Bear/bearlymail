import React from 'react';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { HelpLink } from 'components/inbox/header/HelpLink';
import { ComposeButton } from 'components/inbox/header/ComposeButton';
import { AnalyzeEmailsButton } from 'components/inbox/header/AnalyzeEmailsButton';

interface InboxHeaderActionsProps {
  mode: InboxMode;
  hasRunAnalysis: boolean | null;
}

/**
 * Inbox header actions component
 * Displays action buttons
 */
export const InboxHeaderActions: React.FC<InboxHeaderActionsProps> = ({
  mode,
  hasRunAnalysis,
}) => {
  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      <HelpLink mode={mode} />
      <ComposeButton />
      <AnalyzeEmailsButton hasRunAnalysis={hasRunAnalysis} />
    </div>
  );
};

