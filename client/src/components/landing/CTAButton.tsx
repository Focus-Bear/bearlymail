import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_WHITE_FULL } from 'constants/colors';
import { BUTTON_VARIANT_PRIMARY, BUTTON_VARIANT_SECONDARY, STRING_NONE } from 'constants/strings';

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

  const getPrimaryBackgroundColor = (): string => {
    if (disabled) {
      return theme.colors.button.primary.disable;
    }
    if (isPressed) {
      return theme.colors.button.primary.press;
    }
    if (isHovered) {
      return theme.colors.button.primary.hover;
    }
    return theme.colors.button.primary.default;
  };

  const getSecondaryBorderColor = (): string => {
    if (disabled) {
      return theme.colors.button.secondary.disableBorder;
    }
    if (isPressed) {
      return theme.colors.button.secondary.pressBorder;
    }
    if (isHovered) {
      return theme.colors.button.secondary.hoverBorder;
    }
    return theme.colors.button.secondary.border;
  };

  const getSecondaryTextColor = (): string => {
    if (disabled) {
      return theme.colors.button.secondary.disableText;
    }
    if (isPressed) {
      return theme.colors.button.secondary.pressText;
    }
    if (isHovered) {
      return theme.colors.button.secondary.hoverText;
    }
    return theme.colors.button.secondary.text;
  };

  const getThirdBackgroundColor = (): string => {
    if (disabled) {
      return theme.colors.button.third.disable;
    }
    if (isPressed) {
      return theme.colors.button.third.press;
    }
    if (isHovered) {
      return theme.colors.button.third.hover;
    }
    return theme.colors.button.third.default;
  };

  const getThirdTextColor = (): string => {
    if (disabled) {
      return theme.colors.button.third.disableText;
    }
    return theme.colors.button.third.text;
  };

  const getButtonStyles = () => {
    const baseStyles: React.CSSProperties = {
      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.md,
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.semibold,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: theme.shadows.md,
      transition: theme.transitions.default,
      ...style,
    };

    if (variant === BUTTON_VARIANT_PRIMARY) {
      return {
        ...baseStyles,
        backgroundColor: getPrimaryBackgroundColor(),
        color: COLOR_WHITE_FULL,
      };
    } else if (variant === BUTTON_VARIANT_SECONDARY) {
      return {
        ...baseStyles,
        backgroundColor: theme.colors.button.secondary.default,
        border: `2px solid ${getSecondaryBorderColor()}`,
        color: getSecondaryTextColor(),
      };
    } else {
      // third
      return {
        ...baseStyles,
        backgroundColor: getThirdBackgroundColor(),
        color: getThirdTextColor(),
      };
    }
  };

  const handleClick = () => {
    captureEvent(ANALYTICS_EVENTS.WAIT_LIST_BUTTON_CLICKED);
    onClick();
  };

  return (
    <button
      onClick={handleClick}
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
