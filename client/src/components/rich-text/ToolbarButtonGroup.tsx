import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { FONT_WEIGHT_BOLD_INLINE, FONT_WEIGHT_NORMAL_INLINE, OPACITY_HALF } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: 0,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.sm,
        backgroundColor: (() => {
          if (isActive) {
            return theme.colors.primary.subtle;
          }
          if (isHovered) {
            return theme.colors.interactive.hover;
          }
          return 'transparent';
        })(),
        color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: isActive ? FONT_WEIGHT_BOLD_INLINE : FONT_WEIGHT_NORMAL_INLINE,
        transition: theme.transitions.fast,
        opacity: disabled ? OPACITY_HALF : 1,
      }}
    >
      {children}
    </button>
  );
};

export const ToolbarDivider: React.FC = () => (
  <div
    style={{
      width: '1px',
      height: '20px',
      backgroundColor: theme.colors.border.light,
      margin: `0 ${theme.spacing.xs}`,
    }}
  />
);
