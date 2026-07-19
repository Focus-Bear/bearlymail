/* eslint-disable i18next/no-literal-string */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Email, GitHubLink, InboxMode, TriageSuggestion } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { EmailListItemView } from 'components/inbox/EmailListItemView';
import { MODE_TRIAGE } from 'constants/strings';

const REPO = { owner: 'focusbear', repo: 'bearlymail' };

const CATEGORY_BUILD_ERROR = 'Build Error';
const CATEGORY_NEW_ISSUES = 'New GitHub issues';
const CATEGORY_PRS = 'Code: Pull requests';
const CATEGORY_QA_PASSED = 'QA passed';

// ===== Mock GitHub link payloads (match the schema GitHubProjectBadges renders) =====

const PR_AWAITING_LINK: GitHubLink = {
  type: 'pr',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 1247,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/pull/1247`,
  status: {
    state: 'open',
    title: 'feat(inbox): keyboard shortcuts for star count',
    reviewStatus: null,
    commentsCount: 2,
    mergeable: true,
    merged: false,
    projects: [{ name: 'Sprint 23', status: 'In Review' }],
  },
};

const PR_CHANGES_LINK: GitHubLink = {
  type: 'pr',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 1251,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/pull/1251`,
  status: {
    state: 'open',
    title: 'fix(auth): handle expired refresh tokens',
    reviewStatus: 'changes_requested',
    commentsCount: 12,
    mergeable: false,
    merged: false,
    projects: [{ name: 'Sprint 23', status: 'Changes Requested' }],
  },
};

const ISSUE_1_LINK: GitHubLink = {
  type: 'issue',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 4421,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/issues/4421`,
  status: {
    state: 'open',
    title: 'Crash on Safari iOS 17 — login flow',
    projects: [{ name: 'Sprint 23', status: 'Triage' }],
  },
};

const ISSUE_2_LINK: GitHubLink = {
  type: 'issue',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 4438,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/issues/4438`,
  status: {
    state: 'open',
    title: 'Stripe webhook signature mismatch (intermittent)',
    projects: [{ name: 'Sprint 23', status: 'Triage' }],
  },
};

// Issues that have already been through dev, now sitting in QA with the
// project status set to "QA Passed" after the tester verified them.
const ISSUE_QA_PASSED_1_LINK: GitHubLink = {
  type: 'issue',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 4392,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/issues/4392`,
  status: {
    state: 'open',
    title: 'Email priority race condition when two batches finish together',
    projects: [{ name: 'Sprint 23', status: 'QA Passed' }],
  },
};

const ISSUE_QA_PASSED_2_LINK: GitHubLink = {
  type: 'issue',
  owner: REPO.owner,
  repo: REPO.repo,
  number: 4405,
  url: `https://github.com/${REPO.owner}/${REPO.repo}/issues/4405`,
  status: {
    state: 'open',
    title: 'Snooze parser crashes on "next quarter"',
    projects: [{ name: 'Sprint 23', status: 'QA Passed' }],
  },
};

// ===== Mock emails (real Email shape so EmailListItemView renders them faithfully) =====

const baseEmail = { isSnoozed: false, isRead: false, isProcessingPriority: false, isProcessingSummary: false };

const ISSUE_EMAIL_1: Email = {
  ...baseEmail,
  id: 'demo-issue-1',
  threadId: 'demo-issue-1',
  from: 'notifications@github.com',
  fromName: 'GitHub',
  subject: 'Issue opened: Crash on Safari iOS 17 — login flow (#4421)',
  summary: 'New bug report from a customer. Login flow crashes on iOS 17 Safari when biometric auth is enabled.',
  receivedAt: new Date('2026-05-11T11:08:00Z').toISOString(),
  priorityScore: 72,
  category: CATEGORY_NEW_ISSUES,
  category_id: 'demo-cat-issues',
  starCount: 0,
  githubMetadata: { links: [ISSUE_1_LINK] },
};

const ISSUE_EMAIL_2: Email = {
  ...baseEmail,
  id: 'demo-issue-2',
  threadId: 'demo-issue-2',
  from: 'notifications@github.com',
  fromName: 'GitHub',
  subject: 'Issue opened: Stripe webhook signature mismatch (#4438)',
  summary: 'Intermittent webhook signature mismatch on the Stripe → billing service path. Aria already triaged.',
  receivedAt: new Date('2026-05-11T09:52:00Z').toISOString(),
  priorityScore: 58,
  category: CATEGORY_NEW_ISSUES,
  category_id: 'demo-cat-issues',
  starCount: 0,
  githubMetadata: { links: [ISSUE_2_LINK] },
};

const BUILD_ERROR_EMAIL: Email = {
  ...baseEmail,
  id: 'demo-build-error',
  threadId: 'demo-build-error',
  from: 'actions@github.com',
  fromName: 'GitHub Actions',
  subject: '❌ Build failed on main',
  summary: 'TypeScript compilation error in src/emails/email-sync.processor.ts:142 — property "lastUserOperationAt" does not exist on type "EmailThread". Run #3421 on main@af31c2e.',
  receivedAt: new Date('2026-05-11T07:14:00Z').toISOString(),
  priorityScore: 81,
  category: CATEGORY_BUILD_ERROR,
  category_id: 'demo-cat-build-error',
  starCount: 0,
};

// "QA Passed" emails reach the inbox as a comment from a human QA tester on
// the existing issue. The issue's linked project status has flipped to
// "QA Passed" — that's the at-a-glance signal carried on the email card.
const QA_PASSED_COMMENT_1: Email = {
  ...baseEmail,
  isRead: true,
  id: 'demo-qa-passed-1',
  threadId: 'demo-qa-passed-1',
  from: 'maya.chen@focusbear.io',
  fromName: 'Maya Chen',
  subject: 'Re: Email priority race condition when two batches finish together (#4392)',
  summary: "Maya (QA) commented: ✓ QA passed — repro steps no longer trigger the race after Jeremy's fix. Moving to QA Passed.",
  receivedAt: new Date('2026-05-11T08:30:00Z').toISOString(),
  priorityScore: 22,
  category: CATEGORY_QA_PASSED,
  category_id: 'demo-cat-qa-passed',
  starCount: 0,
  githubMetadata: { links: [ISSUE_QA_PASSED_1_LINK] },
};

const QA_PASSED_COMMENT_2: Email = {
  ...baseEmail,
  isRead: true,
  id: 'demo-qa-passed-2',
  threadId: 'demo-qa-passed-2',
  from: 'sam.patel@focusbear.io',
  fromName: 'Sam Patel',
  subject: 'Re: Snooze parser crashes on "next quarter" (#4405)',
  summary: 'Sam (QA) commented: ✓ QA passed — tested edge cases (next quarter, end of fiscal, in 5 quarters), all parse correctly.',
  receivedAt: new Date('2026-05-10T18:24:00Z').toISOString(),
  priorityScore: 14,
  category: CATEGORY_QA_PASSED,
  category_id: 'demo-cat-qa-passed',
  starCount: 0,
  githubMetadata: { links: [ISSUE_QA_PASSED_2_LINK] },
};

const PR_AWAITING_EMAIL: Email = {
  ...baseEmail,
  id: 'demo-pr-awaiting',
  threadId: 'demo-pr-awaiting',
  from: 'notifications@github.com',
  fromName: 'GitHub',
  subject: 'PR opened: feat(inbox): keyboard shortcuts for star count (#1247)',
  summary: 'Jeremy opened a PR adding keyboard shortcuts for star count. Awaiting your review.',
  receivedAt: new Date('2026-05-11T10:42:00Z').toISOString(),
  priorityScore: 64,
  category: CATEGORY_PRS,
  category_id: 'demo-cat-prs',
  starCount: 0,
  githubMetadata: { links: [PR_AWAITING_LINK] },
};

const PR_CHANGES_EMAIL: Email = {
  ...baseEmail,
  id: 'demo-pr-changes',
  threadId: 'demo-pr-changes',
  from: 'notifications@github.com',
  fromName: 'GitHub',
  subject: 'Changes requested on fix(auth) (#1251)',
  summary: 'Daniel requested changes on the refresh-token PR. 12 comments on a single file.',
  receivedAt: new Date('2026-05-11T10:18:00Z').toISOString(),
  priorityScore: 69,
  category: CATEGORY_PRS,
  category_id: 'demo-cat-prs',
  starCount: 0,
  githubMetadata: { links: [PR_CHANGES_LINK] },
};

// ===== No-op props bundle for EmailListItemView =====

const NOOP = (): void => undefined;
const NOOP_ASYNC = async (): Promise<void> => undefined;

const PRIORITY_TOOLTIP = {
  hoveredPriorityEmailId: null,
  priorityExplanation: null,
  loadingPriorityExplanation: false,
  priorityExplanationError: false,
  togglePriorityTooltip: NOOP,
  hidePriorityTooltip: NOOP,
  expeditePriorityCalculation: NOOP_ASYNC,
  retryPriorityExplanation: NOOP_ASYNC,
};

const KEYBOARD_HINT = {
  showHint: NOOP,
  hideHint: NOOP,
};

const SNOOZE_INPUT = {
  showSnoozeInput: null,
  getSnoozeValue: () => '',
  setSnoozeValue: NOOP,
  showSnooze: NOOP,
  clearSnooze: NOOP,
};

const SUGGESTION_HIGH: TriageSuggestion = {
  suggestedStarCount: 3,
  suggestedArchive: false,
  confidence: 0.92,
  reasoning: 'Build failure on main — needs immediate attention.',
};

const SUGGESTION_MEDIUM: TriageSuggestion = {
  suggestedStarCount: 2,
  suggestedArchive: false,
  confidence: 0.78,
  reasoning: 'Awaiting your input — handle this batch.',
};

const SUGGESTION_ARCHIVE: TriageSuggestion = {
  suggestedStarCount: 0,
  suggestedArchive: true,
  confidence: 0.88,
  reasoning: 'Good-news notification — no action required, safe to archive.',
};

const SUGGESTIONS_BY_EMAIL_ID: Record<string, TriageSuggestion> = {
  'demo-build-error': SUGGESTION_HIGH,
  'demo-issue-1': SUGGESTION_MEDIUM,
  'demo-issue-2': SUGGESTION_MEDIUM,
  'demo-pr-changes': SUGGESTION_MEDIUM,
  'demo-pr-awaiting': SUGGESTION_MEDIUM,
  'demo-qa-passed-1': SUGGESTION_ARCHIVE,
  'demo-qa-passed-2': SUGGESTION_ARCHIVE,
};

function renderEmailRow(email: Email, index: number, mode: InboxMode = MODE_TRIAGE): React.ReactNode {
  return (
    <EmailListItemView
      key={email.id}
      email={email}
      index={index}
      mode={mode}
      isSelected={false}
      suggestion={SUGGESTIONS_BY_EMAIL_ID[email.id] ?? null}
      animatingOutType={null}
      priorityTooltip={PRIORITY_TOOLTIP}
      keyboardHint={KEYBOARD_HINT}
      snoozeInput={SNOOZE_INPUT}
      onEmailClick={NOOP}
      onEmailSelect={NOOP}
      onSetStarCount={NOOP_ASYNC}
      onArchive={NOOP_ASYNC}
      onBlockSender={NOOP}
      onSnooze={NOOP_ASYNC}
    />
  );
}

interface CategorySpec {
  category: string;
  emails: Email[];
  initiallyExpanded: boolean;
}

function byPriorityDesc(left: Email, right: Email): number {
  return (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
}

function maxPriority(emails: Email[]): number {
  return emails.reduce((max, email) => Math.max(max, email.priorityScore ?? 0), 0);
}

// Categories ordered by their highest-priority email so the most urgent group
// sits at the top. Emails within each category are also sorted by priority
// descending. Only the top-priority category is expanded by default; the rest
// render as collapsed headers to keep the section compact.
const CATEGORIES: CategorySpec[] = ([
  { category: CATEGORY_BUILD_ERROR, emails: [BUILD_ERROR_EMAIL] },
  { category: CATEGORY_NEW_ISSUES, emails: [ISSUE_EMAIL_1, ISSUE_EMAIL_2] },
  { category: CATEGORY_PRS, emails: [PR_CHANGES_EMAIL, PR_AWAITING_EMAIL] },
  { category: CATEGORY_QA_PASSED, emails: [QA_PASSED_COMMENT_1, QA_PASSED_COMMENT_2] },
] as Array<Omit<CategorySpec, 'initiallyExpanded'>>)
  .map(spec => ({ ...spec, emails: [...spec.emails].sort(byPriorityDesc) }))
  .sort((left, right) => maxPriority(right.emails) - maxPriority(left.emails))
  .map((spec, index) => ({ ...spec, initiallyExpanded: index === 0 }));

// ===== Component =====

export const GithubIntegrationSection: React.FC = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map(spec => [spec.category, spec.initiallyExpanded]))
  );
  const toggle = (category: string): void =>
    setExpanded(prev => ({ ...prev, [category]: !prev[category] }));

  return (
    <section className="github-section">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t('landing.v2.github.kicker')}</span>
          <h2 className="section-title">
            {t('landing.v2.github.titlePre')}
            <em>{t('landing.v2.github.titleEm')}</em>
            {t('landing.v2.github.titleAfter')}
          </h2>
          <p className="section-sub">{t('landing.v2.github.sub')}</p>
        </div>

        <ul className="gh-perks" aria-label="Highlights">
          <li>
            <span className="gh-perk-ic">✓</span>
            {t('landing.v2.github.perks.qa')}
          </li>
          <li>
            <span className="gh-perk-ic">✓</span>
            {t('landing.v2.github.perks.review')}
          </li>
          <li>
            <span className="gh-perk-ic">✓</span>
            {t('landing.v2.github.perks.issues')}
          </li>
          <li>
            <span className="gh-perk-ic">✓</span>
            {t('landing.v2.github.perks.grouped')}
          </li>
        </ul>

        <div className="gh-demo-card">
          {CATEGORIES.map(spec => (
            <CategoryAccordion
              key={spec.category}
              category={spec.category}
              emails={spec.emails}
              isExpanded={expanded[spec.category] ?? false}
              onToggle={() => toggle(spec.category)}
            >
              {spec.emails.map((email, index) => renderEmailRow(email, index))}
            </CategoryAccordion>
          ))}
        </div>
      </div>
    </section>
  );
};
