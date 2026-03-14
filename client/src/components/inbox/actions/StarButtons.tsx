import React from 'react';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

import { OPACITY_HALF, TOAST_DURATION_MS } from 'components/inbox/constants';
import { EVENT_CLICK } from 'constants/strings';

interface StarButtonsProps {
  email: Email;
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
}

export const StarButtons: React.FC<StarButtonsProps> = ({ email, keyboardHint, onSetStarCount }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      {[1, 2, 3].map(count => (
        <button
          key={count}
          onClick={event => {
            event.stopPropagation();
            const currentCount = email.starCount || 0;
            const newCount = currentCount === count ? 0 : count;
            onSetStarCount(email.id, newCount, event);
            if (event.type === EVENT_CLICK && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
              keyboardHint.showHint(email.id, `Press ${count} to set ${count} star${count > 1 ? 's' : ''}`);
              setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
            }
          }}
          title={
            (email.starCount || 0) === count
              ? `Remove stars (or press ${count})`
              : `Set ${count} star${count > 1 ? 's' : ''} (or press ${count})`
          }
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.4rem',
            padding: '2px 4px',
            color: (email.starCount || 0) >= count ? theme.colors.accent.warning : theme.colors.text.tertiary,
            opacity: (email.starCount || 0) >= count ? 1 : OPACITY_HALF,
            transition: theme.transitions.fast,
          }}
          onMouseEnter={event => {
            event.currentTarget.style.opacity = '1';
            event.currentTarget.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={event => {
            const currentCount = email.starCount || 0;
            event.currentTarget.style.opacity = currentCount >= count ? '1' : String(OPACITY_HALF);
            event.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
};
