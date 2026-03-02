import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMoreVertical } from 'react-icons/fi';
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
  onViewBlockedEmails?: () => void;
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
  onViewBlockedEmails,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

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
              ? `1px solid ${theme.colors.warning.main}`
              : `1px solid ${theme.colors.border.medium}`,
            backgroundColor: debugViewOpen ? theme.colors.warning.light : theme.colors.background.paper,
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
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          title={t('inbox.moreInboxActions')}
          aria-label={t('inbox.moreInboxActions')}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.typography.fontSize.base,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.medium}`,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <FiMoreVertical size={14} />
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              zIndex: 20,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              minWidth: '190px',
            }}
          >
            <button
              onClick={() => {
                onViewBlockedEmails?.();
                setMenuOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                cursor: 'pointer',
                color: theme.colors.text.primary,
              }}
            >
              {t('inbox.viewBlockedEmails')}
            </button>
          </div>
        )}
      </div>
      <HelpLink mode={mode} />
      <ComposeButton />
      <AnalyzeEmailsButton hasRunAnalysis={hasRunAnalysis} />
    </div>
  );
};

