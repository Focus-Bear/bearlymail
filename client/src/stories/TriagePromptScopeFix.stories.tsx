/**
 * Visual stories for the two triage-prompt fixes:
 *
 *  (a) The "well done — you've triaged all the high priority emails!" prompt is a
 *      Triage-guided-flow element. An empty Follow-Up (or Action) tab must show its
 *      OWN normal empty state — the "Generate follow-ups" header + caught-up message —
 *      never the well-done prompt.
 *
 *  (b) When there is NO pre-existing Action/Follow-Up work, clearing the guided
 *      High-and-above Triage list reveals the remaining lower-priority Triage threads
 *      directly instead of gating behind the well-done prompt.
 *
 * Uses the real components + app i18n so the screenshots reflect production copy.
 */
import '../i18n';

import React from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { EmailCard } from 'components/inbox/EmailCard';
import { EmailPreview } from 'components/inbox/EmailPreview';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { EmptyState } from 'components/inbox/states';

import { makeMockEmail } from './storyHelpers/mockEmail';

const meta = {
  title: 'Inbox/TriagePromptScopeFix',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Mimics the inbox list column so cards/states lay out as they do in the app. */
const InboxColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      minHeight: '100vh',
      background: theme.colors.background.default,
      padding: theme.spacing.lg,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        maxWidth: 1000,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * (a) Bug 1 fixed — an empty Follow-Up tab shows its own normal empty state, NOT the
 * triage "well done" prompt.
 */
export const FollowUpEmptyTabNormalState = {
  name: 'Follow-Up empty tab — normal empty state (not the well-done prompt)',
  render: () => (
    <I18nextProvider i18n={i18n}>
      <InboxColumn>
        <FollowUpActions
          onGenerateDrafts={async () => undefined}
          isGenerating={false}
          error={null}
          onRetry={() => undefined}
        />
        <EmptyState mode="follow-up" />
      </InboxColumn>
    </I18nextProvider>
  ),
};

/**
 * (b) Bug 2b fixed — with no Action/Follow-Up work waiting, the cleared guided
 * High-and-above Triage view reveals the remaining lower-priority threads directly.
 */
const LOWER_PRIORITY_TRIAGE_EMAILS = [
  makeMockEmail({
    id: 'reveal-1',
    fromName: 'Weekly Digest',
    from: 'digest@news.example.com',
    correspondentName: 'Weekly Digest',
    subject: 'Your weekly product digest',
    category: 'Newsletters',
    priorityScore: 18,
    actionItemsCount: 0,
    summary: 'Roundup of this week’s product updates and a few blog posts — nothing that needs a reply.',
  }),
  makeMockEmail({
    id: 'reveal-2',
    fromName: 'Community Forum',
    from: 'noreply@forum.example.com',
    correspondentName: 'Community Forum',
    subject: 'New replies in threads you follow',
    category: 'Updates',
    priorityScore: 9,
    actionItemsCount: 0,
    summary: 'Three threads you follow have new replies. FYI only — no action requested from you.',
  }),
  makeMockEmail({
    id: 'reveal-3',
    fromName: 'Rewards Program',
    from: 'rewards@shop.example.com',
    correspondentName: 'Rewards Program',
    subject: 'You have 2 offers expiring soon',
    category: 'Promotions',
    priorityScore: 3,
    actionItemsCount: 0,
    summary: 'Two promotional offers on your account expire this weekend. Low priority marketing email.',
  }),
];

export const TriageLowerPriorityRevealed = {
  name: 'Triage — lower-priority threads revealed (no other work to gate)',
  render: () => (
    <I18nextProvider i18n={i18n}>
      <InboxColumn>
        {LOWER_PRIORITY_TRIAGE_EMAILS.map(email => (
          <EmailCard key={email.id} email={email} isSelected={false} onCardClick={() => {}} mode="triage">
            <EmailPreview email={email} />
          </EmailCard>
        ))}
      </InboxColumn>
    </I18nextProvider>
  ),
};
