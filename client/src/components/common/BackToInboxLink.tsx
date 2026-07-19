import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { ROUTE_INBOX } from 'constants/strings';

interface BackToInboxLinkProps {
  /** Destination route; defaults to the inbox. */
  to?: string;
  /** Label override for non-inbox destinations (e.g. "Back to search results"). */
  label?: string;
  /** Invoked before navigation, e.g. for analytics capture. */
  onClick?: () => void;
}

/**
 * Shared back-navigation control (arrow + label) used by pages that sit outside
 * the inbox shell. Defaults to "Back to Inbox" but the destination and label can
 * be overridden, e.g. to return to preserved search results. Rendered as a
 * react-router Link so it behaves as real navigation (middle-click, cmd-click,
 * screen readers announce it as a link).
 */
export const BackToInboxLink: React.FC<BackToInboxLinkProps> = ({ to = ROUTE_INBOX, label, onClick }) => {
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      onClick={() => onClick?.()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.base,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: theme.transitions.fast,
      }}
      onMouseEnter={event => (event.currentTarget.style.color = theme.colors.text.primary)}
      onMouseLeave={event => (event.currentTarget.style.color = theme.colors.text.secondary)}
    >
      <span aria-hidden="true">←</span>
      <span>{label ?? t('common.backToInbox')}</span>
    </Link>
  );
};
