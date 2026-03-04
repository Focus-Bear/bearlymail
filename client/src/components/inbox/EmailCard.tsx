import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';

import { FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';
import { MODE_TRIAGE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface EmailCardProps {
  email: Email;
  isSelected: boolean;
  onCardClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  mode?: InboxMode;
}

const getBorderColor = (isSelected: boolean, isRead: boolean, wasDeliveredEarly: boolean): string => {
  if (wasDeliveredEarly) return theme.colors.warning.main;
  if (isSelected) return theme.colors.primary.main;
  if (isRead) return theme.colors.border.light;
  return theme.colors.primary.light;
};

export const EmailCard: React.FC<EmailCardProps> = ({
  email,
  isSelected,
  onCardClick,
  children,
  mode,
}) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();
  const wasDeliveredEarly = email.wasDeliveredEarly ?? false;
  const showEmergencyRibbon = wasDeliveredEarly && mode === MODE_TRIAGE;
  const cardPadding = isMobile ? theme.spacing.sm : theme.spacing.lg;
  const emergencyPadding = isMobile ? theme.spacing.lg : theme.spacing.xl;
  const cardPaddingTop = showEmergencyRibbon ? emergencyPadding : cardPadding;

  return (
    <div
      onClick={onCardClick}
      className="animate-fade-in"
      style={{
        backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: cardPadding,
        paddingTop: cardPaddingTop,
        border: `2px solid ${getBorderColor(isSelected, email.isRead, showEmergencyRibbon)}`,
        borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${showEmergencyRibbon ? theme.colors.warning.main : theme.colors.primary.main}`,
        boxShadow: theme.shadows.sm,
        cursor: 'pointer',
        transition: theme.transitions.default,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = theme.shadows.md;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = theme.shadows.sm;
      }}
    >
      {/* Emergency delivery label */}
      {showEmergencyRibbon && (
        <div
          title={t('inbox.emergencyDeliveryTooltip')}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: `linear-gradient(90deg, ${theme.colors.warning.main} 0%, ${theme.colors.warning.light} 100%)`,
            color: theme.colors.warning.main,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: FONT_WEIGHT_SEMIBOLD,
            textAlign: 'center',
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: `1px solid ${theme.colors.warning.main}`,
          }}
        >
          {t('inbox.emergencyDelivery')}
        </div>
      )}
      {children}
    </div>
  );
};
