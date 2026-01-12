import React from 'react';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

interface EmailCardProps {
  email: Email;
  isSelected: boolean;
  onCardClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

const getBorderColor = (isSelected: boolean, isRead: boolean): string => {
  if (isSelected) return theme.colors.primary.main;
  if (isRead) return theme.colors.border.light;
  return theme.colors.primary.light;
};

export const EmailCard: React.FC<EmailCardProps> = ({
  email,
  isSelected,
  onCardClick,
  children,
}) => {
  return (
    <div
      onClick={onCardClick}
      className="animate-fade-in"
      style={{
        backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        border: `2px solid ${getBorderColor(isSelected, email.isRead)}`,
        borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${theme.colors.primary.main}`,
        boxShadow: theme.shadows.sm,
        cursor: 'pointer',
        transition: theme.transitions.default,
        position: 'relative',
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
      {children}
    </div>
  );
};
