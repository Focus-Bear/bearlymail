import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMoreVertical } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { dismissScheduledTour, SCHEDULED_TOUR_UPDATED_EVENT, shouldShowScheduledTour } from 'utils/scheduledTour';

import { HelpLink } from 'components/inbox/header/HelpLink';
import { ScheduledCoachmark } from 'components/inbox/header/ScheduledCoachmark';
import { EMOJI_BUG } from 'constants/emojis';
import { ROUTE_SCHEDULED } from 'constants/strings';

interface InboxHeaderActionsProps {
  mode: InboxMode;
  isAdmin?: boolean;
  debugViewOpen?: boolean;
  onToggleDebug?: () => void;
  onViewBlockedEmails?: () => void;
  onViewAutoRespondedEmails?: () => void;
}

const MENU_ITEM_STYLE: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  color: theme.colors.text.primary,
};

/**
 * Overflow menu (⋮ button) shown in the inbox header.
 *
 * The Scheduled link lives here rather than in the left sidebar (#955 removed
 * it from the nav) so users can still reach /scheduled from the inbox header.
 * Blocked / auto-responded actions are also in this menu so the header stays clean.
 */
const InboxOverflowMenu: React.FC<{
  scheduledLabel: string;
  moreActionsLabel: string;
  viewBlockedLabel: string;
  viewAutoRespondedLabel: string;
  onViewBlockedEmails?: () => void;
  onViewAutoRespondedEmails?: () => void;
}> = ({
  scheduledLabel,
  moreActionsLabel,
  viewBlockedLabel,
  viewAutoRespondedLabel,
  onViewBlockedEmails,
  onViewAutoRespondedEmails,
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateCoachmark = () => setShowCoachmark(shouldShowScheduledTour());
    updateCoachmark();
    if (typeof window === 'undefined') {
      return undefined;
    }
    window.addEventListener(SCHEDULED_TOUR_UPDATED_EVENT, updateCoachmark);
    return () => window.removeEventListener(SCHEDULED_TOUR_UPDATED_EVENT, updateCoachmark);
  }, []);

  const handleDismissCoachmark = () => {
    dismissScheduledTour();
    setShowCoachmark(false);
  };

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
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => {
          if (showCoachmark) {
            handleDismissCoachmark();
          }
          setMenuOpen(prev => !prev);
        }}
        title={moreActionsLabel}
        aria-label={moreActionsLabel}
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
          {onViewBlockedEmails && (
            <button
              onClick={() => {
                onViewBlockedEmails();
                setMenuOpen(false);
              }}
              style={MENU_ITEM_STYLE}
            >
              🚫 {viewBlockedLabel}
            </button>
          )}
          {onViewAutoRespondedEmails && (
            <button
              onClick={() => {
                onViewAutoRespondedEmails();
                setMenuOpen(false);
              }}
              style={MENU_ITEM_STYLE}
            >
              🤖 {viewAutoRespondedLabel}
            </button>
          )}
          <button
            onClick={() => {
              navigate(ROUTE_SCHEDULED);
              setMenuOpen(false);
            }}
            style={MENU_ITEM_STYLE}
          >
            <span>🕐</span> {scheduledLabel}
          </button>
        </div>
      )}
      {showCoachmark && !menuOpen && <ScheduledCoachmark onDismiss={handleDismissCoachmark} />}
    </div>
  );
};

/**
 * Inbox header actions component.
 * Displays action buttons: debug toggle (admin only), help link,
 * and the ⋮ overflow menu (which contains blocked / auto-responded / scheduled).
 */
export const InboxHeaderActions: React.FC<InboxHeaderActionsProps> = ({
  mode,
  isAdmin,
  debugViewOpen,
  onToggleDebug,
  onViewBlockedEmails,
  onViewAutoRespondedEmails,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
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
          <span>{EMOJI_BUG}</span>
        </button>
      )}
      <InboxOverflowMenu
        scheduledLabel={t('nav.scheduled')}
        moreActionsLabel={t('inbox.moreInboxActions')}
        viewBlockedLabel={t('inbox.viewBlockedEmails')}
        viewAutoRespondedLabel={t('inbox.viewAutoRespondedEmails')}
        onViewBlockedEmails={onViewBlockedEmails}
        onViewAutoRespondedEmails={onViewAutoRespondedEmails}
      />
      <HelpLink mode={mode} />
    </div>
  );
};
