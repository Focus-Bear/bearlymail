import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_WHITE } from 'constants/colors';

import { FeedbackModal } from './FeedbackModal';

interface FeedbackButtonProps {
  /** Override button label. Defaults to the contactFeedback.sendFeedbackButton i18n key. */
  label?: string;
  /** Additional inline styles for the button element. */
  style?: React.CSSProperties;
}

/**
 * Button that opens the FeedbackModal when clicked.
 * Drop this anywhere in the UI to give users a quick path to send feedback.
 */
export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ label, style }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          color: COLOR_WHITE,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        {label ?? t('contactFeedback.sendFeedbackButton')}
      </button>
      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
};
