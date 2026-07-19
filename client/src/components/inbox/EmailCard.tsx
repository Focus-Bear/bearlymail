import React from 'react';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';

import { EmergencyDeliveryRibbon } from 'components/inbox/EmergencyDeliveryRibbon';
import { MODE_TRIAGE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface EmailCardProps {
  email: Email;
  isSelected: boolean;
  onCardClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
  mode?: InboxMode;
}

const getBorderColor = (isSelected: boolean, isRead: boolean, wasDeliveredEarly: boolean): string => {
  if (wasDeliveredEarly) {
    return theme.colors.warning.main;
  }
  if (isSelected) {
    return theme.colors.primary.main;
  }
  if (isRead) {
    return theme.colors.border.light;
  }
  return theme.colors.primary.light;
};

export const EmailCard: React.FC<EmailCardProps> = ({ email, isSelected, onCardClick, children, mode }) => {
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
        borderLeft: email.isRead
          ? `1px solid ${theme.colors.border.light}`
          : `4px solid ${showEmergencyRibbon ? theme.colors.warning.main : theme.colors.primary.main}`,
        boxShadow: theme.shadows.sm,
        cursor: 'pointer',
        transition: theme.transitions.default,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
      }}
      onMouseEnter={event => {
        event.currentTarget.style.transform = 'translateY(-2px)';
        event.currentTarget.style.boxShadow = theme.shadows.md;
      }}
      onMouseLeave={event => {
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.boxShadow = theme.shadows.sm;
      }}
    >
      {showEmergencyRibbon && <EmergencyDeliveryRibbon />}
      {children}
    </div>
  );
};
