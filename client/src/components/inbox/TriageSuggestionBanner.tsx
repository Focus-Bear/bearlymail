import React from 'react';
import { theme } from '../../theme/theme';
import { TriageSuggestion } from '../../types/email';
import { captureEvent } from '../../utils/posthog';

interface TriageSuggestionBannerProps {
  suggestion: TriageSuggestion;
  emailId: string;
  onApply: (emailId: string, starCount: number) => Promise<void>;
}

export const TriageSuggestionBanner: React.FC<TriageSuggestionBannerProps> = ({
  suggestion,
  emailId,
  onApply,
}) => {
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
        💡 Suggested:
      </span>
      <div 
        onClick={async (e) => {
          e.stopPropagation();
          captureEvent('triage_suggestion_accepted', {
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
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.5';
        }}
        title={`Click to set ${suggestion.suggestedStarCount} stars (or press ${suggestion.suggestedStarCount})`}
      >
        {'⭐'.repeat(suggestion.suggestedStarCount)}
      </div>
      <span style={{ 
        color: theme.colors.text.tertiary, 
        fontSize: theme.typography.fontSize.xs,
      }}>
        →
      </span>
    </div>
  );
};

