import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { TriageSuggestion } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_LIGHTBULB, EMOJI_STAR } from 'constants/emojis';

interface TriageSuggestionBannerProps {
  suggestion: TriageSuggestion;
  emailId: string;
  onApply: (emailId: string, starCount: number) => Promise<void>;
}

export const TriageSuggestionBanner: React.FC<TriageSuggestionBannerProps> = ({ suggestion, emailId, onApply }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.subtle,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        marginBottom: theme.spacing.xs,
        fontSize: theme.typography.fontSize.xs,
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        position: 'relative',
      }}
    >
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
        {EMOJI_LIGHTBULB} {t('inbox.suggested')}:
      </span>
      <div
        onClick={async event => {
          event.stopPropagation();
          captureEvent(ANALYTICS_EVENTS.TRIAGE_SUGGESTION_ACCEPTED, {
            email_id: emailId,
            suggested_star_count: suggestion.suggestedStarCount,
          });
          await onApply(emailId, suggestion.suggestedStarCount);
        }}
        style={{
          display: 'flex',
          gap: '2px',
          opacity: 0.5,
          cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={event => {
          event.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={event => {
          event.currentTarget.style.opacity = '0.5';
        }}
        title={t('inbox.clickToSetStars', { count: suggestion.suggestedStarCount })}
      >
        {EMOJI_STAR.repeat(suggestion.suggestedStarCount)}
      </div>
      <span
        style={{
          color: theme.colors.text.tertiary,
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        →
      </span>
    </div>
  );
};
