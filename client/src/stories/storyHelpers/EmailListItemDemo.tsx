/**
 * EmailListItemDemo — sample data and wrapper for EmailListItem stories.
 * No Redux store needed — animation state is passed as props to EmailListItemView.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Email } from 'types/email';

import { EmailListItemView } from 'components/inbox/EmailListItemView';

import { emailListItemI18n } from './i18nInstances';

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
  togglePriorityTooltip: noopSync,
  hidePriorityTooltip: noopSync,
  expeditePriorityCalculation: noop,
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

export interface ItemDemoProps {
  isSelected?: boolean;
  animating?: 'archive' | 'priority' | null;
}

export const ItemDemo: React.FC<ItemDemoProps> = ({
  isSelected = false,
  animating = null,
}) => (
  <I18nextProvider i18n={emailListItemI18n}>
    <div style={{ maxWidth: 700 }}>
      <EmailListItemView
        email={SAMPLE_EMAIL}
        index={0}
        mode="triage"
        isSelected={isSelected}
        suggestion={null}
        animatingOutType={
          animating === 'archive' ? 'archive' : animating === 'priority' ? 'priority' : null
        }
        animatingOutStarCount={animating === 'priority' ? 3 : undefined}
        priorityTooltip={defaultPriorityTooltip}
        keyboardHint={defaultKeyboardHint}
        snoozeInput={defaultSnoozeInput}
        onEmailClick={(_id, _idx, _evt) => console.log('Email click')}
        onEmailSelect={(_id, _evt) => console.log('Email select')}
        onSetStarCount={async (_id, count) => console.log('Set star count:', count)}
        onArchive={async (_id, _evt) => console.log('Archive')}
        onBlockSender={(_id, _evt) => console.log('Block sender')}
        onSnooze={async (_id) => console.log('Snooze')}
      />
    </div>
  </I18nextProvider>
);
