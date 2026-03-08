import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface SidebarHeaderProps {
  isCollapsed?: boolean;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ isCollapsed = false }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        paddingLeft: isCollapsed ? theme.spacing.xs : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: theme.spacing.sm,
      }}
    >
      <img
        src="/favicon.svg"
        alt="BearlyMail Icon"
        style={{
          height: '28px',
          width: 'auto',
          objectFit: 'contain',
        }}
      />
      {!isCollapsed && (
        <h2
          style={{
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            letterSpacing: '-0.02em',
          }}
        >
          {t('common.appName')}
        </h2>
      )}
    </div>
  );
};
