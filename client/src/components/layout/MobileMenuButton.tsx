import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_MENU } from 'constants/emojis';

interface MobileMenuButtonProps {
  onClick: () => void;
}

/**
 * Floating hamburger button that opens the sidebar drawer on narrow viewports.
 * Rendered by SidebarPageLayout; matches the button previously duplicated on
 * Settings, Stats and other sidebar pages.
 */
export const MobileMenuButton: React.FC<MobileMenuButtonProps> = ({ onClick }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        top: theme.spacing.md,
        left: theme.spacing.md,
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: `1px solid ${theme.colors.border.medium}`,
        backgroundColor: theme.colors.background.paper,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        transition: theme.transitions.fast,
        boxShadow: theme.shadows.md,
        zIndex: 100,
      }}
      aria-label={t('common.openNavigationMenu')}
    >
      {EMOJI_MENU}
    </button>
  );
};
