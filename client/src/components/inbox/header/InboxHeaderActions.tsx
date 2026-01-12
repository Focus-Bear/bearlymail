import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { HelpLink } from 'components/inbox/header/HelpLink';
import { ComposeButton } from 'components/inbox/header/ComposeButton';
import { AnalyzeEmailsButton } from 'components/inbox/header/AnalyzeEmailsButton';

interface InboxHeaderActionsProps {
  mode: InboxMode;
  nextDeliveryText: string | null;
  hasRunAnalysis: boolean | null;
}

/**
 * Inbox header actions component
 * Displays action buttons and next delivery info
 */
export const InboxHeaderActions: React.FC<InboxHeaderActionsProps> = ({
  mode,
  nextDeliveryText,
  hasRunAnalysis,
}) => {
  const { t } = useTranslation();
  
  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      {nextDeliveryText && (
        <span
          style={{
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('inbox.nextBatch')}: {nextDeliveryText}
        </span>
      )}
      <HelpLink mode={mode} />
      <ComposeButton />
      <AnalyzeEmailsButton hasRunAnalysis={hasRunAnalysis} />
    </div>
  );
};

