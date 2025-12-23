import React, { useState } from 'react';
import { theme } from '../../theme/theme';

interface CTAButtonProps {
  /**
   * Click handler that scrolls to the waitlist form
   */
  onClick: () => void;
  /**
   * Button text
   */
  children: React.ReactNode;
  /**
   * Optional custom styles
   */
  style?: React.CSSProperties;
  /**
   * Button variant: primary, secondary, or third
   */
  variant?: 'primary' | 'secondary' | 'third';
  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
}

/**
 * Reusable Call-to-Action button component
 * Used throughout the landing page to scroll to the waitlist form
 * Implements Focus Bear brand button styles with proper states
 */
export const CTAButton: React.FC<CTAButtonProps> = ({ 
  onClick, 
  children, 
  style, 
  variant = 'primary',
  disabled = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const getButtonStyles = () => {
    const baseStyles: React.CSSProperties = {
      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
      border: 'none',
      borderRadius: theme.borderRadius.md,
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.semibold,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: theme.shadows.md,
      transition: theme.transitions.default,
      ...style,
    };

    if (variant === 'primary') {
      return {
        ...baseStyles,
        backgroundColor: disabled 
          ? theme.colors.button.primary.disable
          : isPressed 
            ? theme.colors.button.primary.press
            : isHovered 
              ? theme.colors.button.primary.hover
              : theme.colors.button.primary.default,
        color: '#FFFFFF',
      };
    } else if (variant === 'secondary') {
      return {
        ...baseStyles,
        backgroundColor: theme.colors.button.secondary.default,
        border: `2px solid ${disabled 
          ? theme.colors.button.secondary.disableBorder
          : isPressed 
            ? theme.colors.button.secondary.pressBorder
            : isHovered 
              ? theme.colors.button.secondary.hoverBorder
              : theme.colors.button.secondary.border}`,
        color: disabled 
          ? theme.colors.button.secondary.disableText
          : isPressed 
            ? theme.colors.button.secondary.pressText
            : isHovered 
              ? theme.colors.button.secondary.hoverText
              : theme.colors.button.secondary.text,
      };
    } else { // third
      return {
        ...baseStyles,
        backgroundColor: disabled 
          ? theme.colors.button.third.disable
          : isPressed 
            ? theme.colors.button.third.press
            : isHovered 
              ? theme.colors.button.third.hover
              : theme.colors.button.third.default,
        color: disabled 
          ? theme.colors.button.third.disableText
          : theme.colors.button.third.text,
      };
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => !disabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={getButtonStyles()}
    >
      {children}
    </button>
  );
};

