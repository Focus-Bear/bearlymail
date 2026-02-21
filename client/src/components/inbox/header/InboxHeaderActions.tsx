import React from 'react';
import { useTranslation } from 'react-i18next';
import { EMOJI_BUG } from 'constants/emojis';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { HelpLink } from 'components/inbox/header/HelpLink';
import { ComposeButton } from 'components/inbox/header/ComposeButton';
import { AnalyzeEmailsButton } from 'components/inbox/header/AnalyzeEmailsButton';

interface InboxHeaderActionsProps {
  mode: InboxMode;
  hasRunAnalysis: boolean | null;
  isAdmin?: boolean;
  debugViewOpen?: boolean;
  onToggleDebug?: () => void;
}

/**
 * Inbox header actions component
 * Displays action buttons
 */
export const InboxHeaderActions: React.FC<InboxHeaderActionsProps> = ({
  mode,
  hasRunAnalysis,
  isAdmin,
  debugViewOpen,
  onToggleDebug,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      {isAdmin && onToggleDebug && (
        <button
          onClick={onToggleDebug}
          title={t('inbox.toggleDebug')}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.typography.fontSize.base,
            borderRadius: theme.borderRadius.md,
            border: debugViewOpen
              ? `1px solid #FFC107`
              : `1px solid ${theme.colors.border.medium}`,
            backgroundColor: debugViewOpen ? '#FFF8E1' : theme.colors.background.paper,
            color: theme.colors.text.primary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            transition: theme.transitions.fast,
          }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>{EMOJI_BUG}</span>
        </button>
      )}
      <HelpLink mode={mode} />
      <ComposeButton />
      <AnalyzeEmailsButton hasRunAnalysis={hasRunAnalysis} />
    </div>
  );
};

