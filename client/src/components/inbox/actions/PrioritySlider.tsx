import React from 'react';
import { Email, TriageSuggestion } from 'types/email';

import { PriorityInlineSelector } from 'components/priority/PriorityInlineSelector';

interface PrioritySliderProps {
  email: Email;
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  /** If present, the pill matching suggestion.suggestedStarCount gets the
   * .animate-recommended-pulse class. CSS in App.css picks one of the
   * marked pills to actually animate (first email by default, or whichever
   * email the user is hovering). */
  suggestion?: TriageSuggestion | null;
  /** The Archive action pill, rendered first in the selector row (inbox-list design). */
  leadingPill?: React.ReactNode;
  /** Lay the "PRIORITY" label inline beside the pills (with a divider). */
  inlineLabel?: boolean;
}

/** Inbox-list priority control — the slim {@link PriorityInlineSelector} with triage pulse. */
export const PrioritySlider: React.FC<PrioritySliderProps> = ({
  email,
  onSetStarCount,
  suggestion,
  leadingPill,
  inlineLabel,
}) => {
  const recommendedStarCount = suggestion && suggestion.suggestedStarCount > 0 ? suggestion.suggestedStarCount : null;

  return (
    <PriorityInlineSelector
      starCount={email.starCount || 0}
      recommendedStarCount={recommendedStarCount}
      leadingPill={leadingPill}
      inlineLabel={inlineLabel}
      onSelect={(newCount, event) => onSetStarCount(email.id, newCount, event)}
    />
  );
};
