import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, TriageSuggestion } from 'types/email';

interface PrioritySliderProps {
  email: Email;
  keyboardHint?: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  /** If present, the button matching suggestion.suggestedStarCount gets the
   * .animate-recommended-pulse class. CSS in App.css picks one of the
   * marked buttons to actually animate (first email by default, or whichever
   * email the user is hovering). */
  suggestion?: TriageSuggestion | null;
}

const PRIORITY_LEVELS = [
  { value: 1, emoji: '😌', label: 'inbox.canWait' },
  { value: 2, emoji: '😅', label: 'inbox.getOnIt' },
  { value: 3, emoji: '🙀', label: 'inbox.ohShit' },
] as const;

const INACTIVE_OPACITY = 0.4;

export const PrioritySlider: React.FC<PrioritySliderProps> = ({ email, keyboardHint, onSetStarCount, suggestion }) => {
  const { t } = useTranslation();
  const currentStarCount = email.starCount || 0;
  const recommendedStarCount = suggestion && suggestion.suggestedStarCount > 0 ? suggestion.suggestedStarCount : null;

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
      {PRIORITY_LEVELS.map(level => (
        <button
          key={level.value}
          className={level.value === recommendedStarCount ? 'animate-recommended-pulse' : undefined}
          onClick={event => {
            event.stopPropagation();
            const newCount = currentStarCount === level.value ? 0 : level.value;
            onSetStarCount(email.id, newCount, event);
          }}
          title={t(level.label)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.4rem',
            padding: '2px 4px',
            opacity: currentStarCount === level.value ? 1 : INACTIVE_OPACITY,
            transition: theme.transitions.fast,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
          onMouseEnter={event => {
            event.currentTarget.style.opacity = '1';
            event.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={event => {
            event.currentTarget.style.opacity = currentStarCount === level.value ? '1' : String(INACTIVE_OPACITY);
            event.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span>{level.emoji}</span>
          <span
            style={{
              fontSize: '0.65rem',
              color: theme.colors.text.tertiary,
              whiteSpace: 'nowrap',
            }}
          >
            {t(level.label)}
          </span>
        </button>
      ))}
    </div>
  );
};
