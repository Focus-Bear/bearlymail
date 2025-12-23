import React from 'react';
import { theme } from '../../theme/theme';

interface ConsentModalFooterProps {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  loading: boolean;
  onAccept: () => void;
}

/**
 * Consent modal footer component
 */
export const ConsentModalFooter: React.FC<ConsentModalFooterProps> = ({
  termsAccepted,
  privacyAccepted,
  loading,
  onAccept,
}) => {
  const isButtonDisabled = (): boolean => {
    return !termsAccepted || !privacyAccepted || loading;
  };

  const getButtonBackgroundColor = (): string => {
    if (isButtonDisabled()) return theme.colors.button.primary.disable;
    return theme.colors.button.primary.default;
  };

  const getButtonHoverColor = (): string => {
    return theme.colors.button.primary.hover;
  };

  const getButtonPressColor = (): string => {
    return theme.colors.button.primary.press;
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacing.md,
        justifyContent: 'flex-end',
      }}
    >
      <button
        onClick={onAccept}
        disabled={isButtonDisabled()}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.xl}`,
          backgroundColor: getButtonBackgroundColor(),
          color: '#FFFFFF',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: isButtonDisabled() ? 'not-allowed' : 'pointer',
          transition: theme.transitions.default,
        }}
        onMouseEnter={(e) => {
          if (!isButtonDisabled()) {
            e.currentTarget.style.backgroundColor = getButtonHoverColor();
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = getButtonBackgroundColor();
        }}
        onMouseDown={(e) => {
          if (!isButtonDisabled()) {
            e.currentTarget.style.backgroundColor = getButtonPressColor();
          }
        }}
        onMouseUp={(e) => {
          if (!isButtonDisabled()) {
            e.currentTarget.style.backgroundColor = getButtonHoverColor();
          }
        }}
      >
        {loading ? 'Saving...' : 'Accept & Continue'}
      </button>
    </div>
  );
};

