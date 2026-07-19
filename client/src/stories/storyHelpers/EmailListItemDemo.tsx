/**
 * EmailListItemDemo — sample data and wrapper for EmailListItem stories.
 * No Redux store needed — animation state is passed as props to EmailListItemView.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Email } from 'types/email';

import { EmailListItemView } from 'components/inbox/EmailListItemView';

import { emailListItemI18n } from './i18nInstances';

// The card header renders InboxContactTypeBadge, which calls useContactTypesQuery
// (TanStack Query). Provide a no-network client so the story renders (the badge
// simply shows nothing without data).
const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, enabled: false } },
});

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const SAMPLE_EMAIL: Email = {
  id: 'email-001',
  threadId: 'thread-001',
  from: 'alice@example.com',
  fromName: 'Alice Chen',
  subject: 'Re: Monash Grand Prix Event — Catering Confirmation Needed',
  body: 'Hi Jeremy, following up on the catering arrangements. We need confirmation by Thursday.',
  date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  isRead: false,
  priorityScore: 45,
  starCount: 0,
  category: 'Action',
} as unknown as Email;

// ---------------------------------------------------------------------------
// No-op stubs for required callbacks
// ---------------------------------------------------------------------------

const noop = async () => {};
const noopSync = () => {};

export const defaultPriorityTooltip = {
  hoveredPriorityEmailId: null,
  priorityExplanation: null,
  loadingPriorityExplanation: false,
  priorityExplanationError: false,
  togglePriorityTooltip: noopSync,
  hidePriorityTooltip: noopSync,
  expeditePriorityCalculation: noop,
  retryPriorityExplanation: noop,
};

export const defaultKeyboardHint = {
  showHint: noopSync,
  hideHint: noopSync,
};

export const defaultSnoozeInput = {
  showSnoozeInput: null,
  getSnoozeValue: () => '',
  setSnoozeValue: noopSync,
  showSnooze: noopSync,
  clearSnooze: noopSync,
};

// ---------------------------------------------------------------------------
// Demo wrapper
// ---------------------------------------------------------------------------

// Follow-up sample: starred thread awaiting a reply, with the metadata fields
// FollowUpMetadata reads (days since their reply, when the user last replied).
export const SAMPLE_FOLLOWUP_EMAIL: Email = {
  ...SAMPLE_EMAIL,
  id: 'email-002',
  starCount: 3,
  otherPersonName: 'Maxie Juang',
  lastTheirReplyAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
  lastMyReplyAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
} as unknown as Email;

type DemoFollowUpData = NonNullable<React.ComponentProps<typeof EmailListItemView>['followUpData']>;

// A follow-up record with no draft and an inactive status — the state that used
// to render an empty grey box in the card.
export const EMPTY_FOLLOWUP_DATA: DemoFollowUpData = {
  id: 'fu-001',
  draftFollowUp: null,
  generationStatus: 'completed',
  generationError: null,
  sendStatus: null,
  sendError: null,
};

export const DRAFTED_FOLLOWUP_DATA: DemoFollowUpData = {
  id: 'fu-002',
  draftFollowUp: 'Hi Maxie, just following up on the furniture and ergonomic workspace details — any update?',
  generationStatus: 'completed',
  generationError: null,
  sendStatus: null,
  sendError: null,
};

export interface ItemDemoProps {
  isSelected?: boolean;
  animating?: 'archive' | 'priority' | null;
  mode?: 'triage' | 'action' | 'follow-up';
  followUpData?: DemoFollowUpData | null;
  /** Container width — the follow-up bugs reproduce in narrow (split-view) columns. */
  maxWidth?: number;
}

export const ItemDemo: React.FC<ItemDemoProps> = ({
  isSelected = false,
  animating = null,
  mode = 'triage',
  followUpData = null,
  maxWidth = 700,
}) => (
  <QueryClientProvider client={storyQueryClient}>
  <I18nextProvider i18n={emailListItemI18n}>
    <div style={{ maxWidth }}>
      <EmailListItemView
        email={mode === 'follow-up' ? SAMPLE_FOLLOWUP_EMAIL : SAMPLE_EMAIL}
        index={0}
        mode={mode}
        isSelected={isSelected}
        suggestion={null}
        animatingOutType={animating === 'archive' ? 'archive' : animating === 'priority' ? 'priority' : null}
        animatingOutStarCount={animating === 'priority' ? 3 : undefined}
        priorityTooltip={defaultPriorityTooltip}
        keyboardHint={defaultKeyboardHint}
        snoozeInput={defaultSnoozeInput}
        followUpData={followUpData}
        onUpdateDraft={async () => console.log('Update draft')}
        onSendFollowUp={async () => console.log('Send follow-up')}
        onEmailClick={(_id, _idx, _evt) => console.log('Email click')}
        onEmailSelect={(_id, _evt) => console.log('Email select')}
        onSetStarCount={async (_id, count) => console.log('Set star count:', count)}
        onArchive={async (_id, _evt) => console.log('Archive')}
        onBlockSender={(_id, _evt) => console.log('Block sender')}
        onSnooze={async _id => console.log('Snooze')}
      />
    </div>
  </I18nextProvider>
  </QueryClientProvider>
);
