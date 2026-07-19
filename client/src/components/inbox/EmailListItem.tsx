import React from 'react';
import { useSelector } from 'react-redux';
import { Email, InboxMode, PriorityExplanation, TriageSuggestion } from 'types/email';

import { ANIMATION_TYPE_ARCHIVE, ANIMATION_TYPE_PRIORITY } from 'constants/strings';
import { selectAnimatingOut } from 'store/selectors/emailSelectors';

import { EmailListItemView } from './EmailListItemView';

interface EmailListItemProps {
  email: Email;
  index: number;
  mode: InboxMode;
  isSelected: boolean;
  suggestion: TriageSuggestion | null;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: PriorityExplanation | null;
    loadingPriorityExplanation: boolean;
    priorityExplanationError: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
    expeditePriorityCalculation: (emailId: string) => Promise<void>;
    retryPriorityExplanation: (emailId: string) => Promise<void>;
  };
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent) => void;
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  followUpData?: {
    id: string;
    draftFollowUp: string | null;
    generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
    generationError: string | null;
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
    sendError: string | null;
  } | null;
  onUpdateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onSendFollowUp?: (followUpId: string, draft: string) => Promise<void>;
  recipientName?: string;
}

/**
 * Container component: reads animation state from Redux store and passes it
 * to the presentational EmailListItemView.
 *
 * To render in Storybook, use EmailListItemView directly with animatingOutType prop.
 */
export const EmailListItem: React.FC<EmailListItemProps> = props => {
  const animatingOut = useSelector(selectAnimatingOut);
  const animatingOutItem = animatingOut.find(item => item.id === props.email.id);

  let animatingOutType: typeof ANIMATION_TYPE_ARCHIVE | typeof ANIMATION_TYPE_PRIORITY | null = null;
  if (animatingOutItem?.type === ANIMATION_TYPE_ARCHIVE) {
    animatingOutType = ANIMATION_TYPE_ARCHIVE;
  } else if (animatingOutItem?.type === ANIMATION_TYPE_PRIORITY) {
    animatingOutType = ANIMATION_TYPE_PRIORITY;
  }

  return (
    <EmailListItemView
      {...props}
      animatingOutType={animatingOutType}
      animatingOutStarCount={animatingOutItem?.starCount}
    />
  );
};
