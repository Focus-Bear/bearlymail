/* eslint-disable @typescript-eslint/no-magic-numbers -- fixture data */
import { AUTO_ARCHIVE_SENDER_SCOPE } from "../../constants/auto-archive-proposal.constants";
import { AnalysedEmail, SenderGroup } from "../auto-archive-proposals.types";
import { classifyEngagement, EngagementSignals } from "../engagement.helper";

/**
 * A realistic 60-day mailbox for one user, generated deterministically:
 *
 * GitHub (notifications@github.com)
 *  - "Check Translations" CI failures on Mac-App — never opened (the noise the
 *    user described).
 *  - "Build and Test" CI failures — opened: CI is not uniformly noise.
 *  - Review requests — opened, often replied.
 *  - Bot review comments on PRs — mixed engagement, must not be proposed.
 *  - Dependabot bumps on another repo — never opened.
 * Sentry (noreply@md.getsentry.com)
 *  - New-issue alerts for the Mac project — never opened.
 *  - High-priority backend alerts — opened.
 *  - Weekly reports — never opened but too few to be confident.
 * A colleague (always engaged) and a product digest (never opened).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;
export const FIXTURE_NOW = new Date("2026-10-20T00:00:00Z");

/** Mulberry32 — tiny deterministic PRNG so the fixture never flakes. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(20261020);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)];
const hex = (length: number) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const integer = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));

const BRANCHES = [
  "main",
  "fix/onboarding-copy",
  "feat/day-plan-sync",
  "cluster/c4-focus-modes",
  "chore/bump-sentry",
  "fix/helper-relaunch",
];
const PR_TITLES = [
  "fix: postpone a running routine when extending focus",
  "feat: per-focus-mode AI toggle",
  "fix: serialize helper relaunch attempts",
  "Prefer centered date navigation over its ideal label width",
  "fix: retain current day commitments in earlier proposals",
  "chore: move signing config into xcconfig",
  "feat: SwiftUI day plan task detail",
  "fix: keychain prompt on every rebuild",
];
const EXCEPTIONS = [
  "NSRangeException: index beyond bounds",
  "EXC_BAD_ACCESS in ScheduleBuilder.build",
  "NSInternalInconsistencyException: invalid update",
  "AppHang: main thread blocked",
  "SIGABRT in DayPlanTaskStore.save",
];
const BACKEND_ERRORS = [
  "TypeError: Cannot read properties of undefined (reading 'userId')",
  "QueryFailedError: deadlock detected",
  "Error: Stripe webhook signature mismatch",
];

const KIND = {
  NEVER: "never",
  OPEN: "open",
  REPLY: "reply",
  GLANCE: "glance",
} as const;

type Engagement = (typeof KIND)[keyof typeof KIND];

interface Template {
  from: string;
  subject: () => string;
  body: () => string;
  count: number;
  /** Engagement choice per email (called once per email). */
  engagement: () => Engagement;
}

let idCounter = 0;

/** Which template generated each email id — lets tests assert by email kind. */
export const TEMPLATE_OF = new Map<string, string>();

function archiveTime(
  engagement: Engagement,
  receivedAt: Date,
  openedAt: Date | null,
  archivedUnread: boolean,
): Date | null {
  if (openedAt && engagement === KIND.GLANCE) {
    return new Date(openedAt.getTime() + 4_000);
  }
  if (openedAt) return new Date(openedAt.getTime() + 600_000);
  return archivedUnread ? new Date(receivedAt.getTime() + 7_200_000) : null;
}

function signalsFor(
  engagement: Engagement,
  receivedAt: Date,
): EngagementSignals {
  const isNever = engagement === KIND.NEVER;
  const openedAt = isNever ? null : new Date(receivedAt.getTime() + 3_600_000);
  const archivedUnread = isNever && random() < 0.6;
  return {
    receivedAt,
    isRead: !isNever || archivedUnread,
    openedAt,
    archivedAt: archiveTime(engagement, receivedAt, openedAt, archivedUnread),
    archivedWhileUnread: archivedUnread,
    archivedByWorkflow: false,
    replied: engagement === KIND.REPLY,
    starred: false,
    userPriorityOverride: null,
  };
}

function generate([name, template]: [string, Template]): AnalysedEmail[] {
  return Array.from({ length: template.count }, () => {
    const receivedAt = new Date(
      FIXTURE_NOW.getTime() - random() * WINDOW_DAYS * DAY_MS,
    );
    const signals = signalsFor(template.engagement(), receivedAt);
    idCounter += 1;
    const id = `email-${idCounter}`;
    TEMPLATE_OF.set(id, name);
    return {
      id,
      from: template.from,
      subject: template.subject(),
      body: template.body(),
      receivedAt,
      signals,
      level: classifyEngagement(signals),
    };
  });
}

const GITHUB = "notifications@github.com";
const SENTRY = "noreply@md.getsentry.com";

const never = (): Engagement => KIND.NEVER;
const mostlyOpened = (): Engagement =>
  random() < 0.9 ? KIND.OPEN : KIND.NEVER;

export const GITHUB_TEMPLATES = {
  translationCiFailure: {
    from: GITHUB,
    count: 48,
    subject: () =>
      `[Focus-Bear/Mac-App] Run failed: Check Translations - ${pick(BRANCHES)} (${hex(7)})`,
    body: () =>
      `Check Translations: Some jobs were not successful\nView workflow run: https://github.com/Focus-Bear/Mac-App/actions/runs/${integer(10_000_000, 99_999_999)}\n\ncheck-translations\nFailed in ${integer(12, 59)} seconds\n\nYou are receiving this because you are subscribed to this thread.`,
    engagement: never,
  },
  buildCiFailure: {
    from: GITHUB,
    count: 14,
    subject: () =>
      `[Focus-Bear/Mac-App] Run failed: Build and Test - ${pick(BRANCHES)} (${hex(7)})`,
    body: () =>
      `Build and Test: All jobs have failed\nView workflow run: https://github.com/Focus-Bear/Mac-App/actions/runs/${integer(10_000_000, 99_999_999)}\n\nbuild\nFailed in ${integer(4, 19)} minutes\n\nYou are receiving this because you are subscribed to this thread.`,
    engagement: () => (random() < 0.85 ? KIND.OPEN : KIND.NEVER),
  },
  reviewRequest: {
    from: GITHUB,
    count: 22,
    subject: () =>
      `[Focus-Bear/Mac-App] ${pick(PR_TITLES)} (PR #${integer(2400, 2900)})`,
    body: () =>
      `@jeznag requested your review on: Focus-Bear/Mac-App#${integer(2400, 2900)} ${pick(PR_TITLES)}.\n\nReply to this email directly, view it on GitHub: https://github.com/Focus-Bear/Mac-App/pull/${integer(2400, 2900)}\nYou are receiving this because your review was requested.`,
    engagement: () => (random() < 0.5 ? KIND.REPLY : KIND.OPEN),
  },
  botComment: {
    from: GITHUB,
    count: 30,
    subject: () =>
      `Re: [Focus-Bear/Mac-App] ${pick(PR_TITLES)} (PR #${integer(2400, 2900)})`,
    body: () =>
      `gemini-code-assist[bot] left a comment (Focus-Bear/Mac-App#${integer(2400, 2900)})\n\nCode Review\nThis pull request introduces a change to the helper relaunch logic.\n\nYou are receiving this because you authored the thread.`,
    engagement: () => (random() < 0.5 ? KIND.OPEN : KIND.NEVER),
  },
  dependabot: {
    from: GITHUB,
    count: 18,
    subject: () =>
      `[Focus-Bear/bearlymail] Bump ${pick(["axios", "pg-boss", "vite", "typeorm"])} from ${integer(1, 9)}.${integer(0, 20)}.${integer(0, 9)} to ${integer(1, 9)}.${integer(0, 20)}.${integer(0, 9)} in /server (PR #${integer(300, 400)})`,
    body: () =>
      `Bumps the npm dependency.\nRelease notes sourced from the package repository.\n\nDependabot will resolve any conflicts with this PR as long as you don't alter it yourself.\n\nYou are receiving this because you are subscribed to this thread.`,
    engagement: never,
  },
} satisfies Record<string, Template>;

export const SENTRY_TEMPLATES = {
  macNewIssue: {
    from: SENTRY,
    count: 42,
    subject: () =>
      `[Sentry] FOCUS-BEAR-MAC-${hex(3).toUpperCase()}: ${pick(EXCEPTIONS)}`,
    body: () =>
      `New issue in focus-bear-mac\n\n${pick(EXCEPTIONS)}\nEvents: ${integer(1, 400)} Users: ${integer(1, 40)}\nRelease: ${integer(2, 3)}.${integer(0, 60)}.${integer(0, 9)}\n\nThis email was triggered by: Send a notification for new issues`,
    engagement: never,
  },
  backendHighPriority: {
    from: SENTRY,
    count: 16,
    subject: () =>
      `[Sentry] FOCUS-BEAR-BACKEND-${hex(3).toUpperCase()}: ${pick(BACKEND_ERRORS)}`,
    body: () =>
      `High priority issue in focus-bear-backend\n\n${pick(BACKEND_ERRORS)}\nEvents: ${integer(50, 900)} Users: ${integer(10, 300)}\n\nThis email was triggered by: High priority issues`,
    engagement: mostlyOpened,
  },
  weeklyReport: {
    from: SENTRY,
    count: 8,
    subject: () =>
      `Weekly Report for Focus Bear: ${pick(["Sep", "Oct"])} ${integer(1, 28)} - ${pick(["Sep", "Oct"])} ${integer(1, 28)}`,
    body: () =>
      `Here's your weekly summary of errors and performance for Focus Bear.\n\nTotal errors: ${integer(100, 9000)}`,
    engagement: never,
  },
} satisfies Record<string, Template>;

const COLLEAGUE: Template = {
  from: "catherine@focusbear.io",
  count: 26,
  subject: () =>
    pick(["QA results for", "Question about", "Re: test plan for"]).concat(
      ` ${pick(PR_TITLES)}`,
    ),
  body: () =>
    "Hi Jeremy,\n\nI tested this on the latest build and have a few notes.",
  engagement: () => (random() < 0.6 ? KIND.REPLY : KIND.OPEN),
};

const DIGEST: Template = {
  from: "digest@producthunt.com",
  count: 30,
  subject: () =>
    `Product Hunt Daily: ${pick(["AI agents", "Mac utilities", "Focus tools"])} for ${pick(["Oct", "Sep"])} ${integer(1, 28)}`,
  body: () => "The best new products, every day.\n\nTop launches today",
  engagement: never,
};

function byReceivedAt(left: AnalysedEmail, right: AnalysedEmail): number {
  return left.receivedAt.getTime() - right.receivedAt.getTime();
}

function group(
  senderKey: string,
  senderPattern: string,
  templates: Record<string, Template>,
): SenderGroup {
  return {
    senderKey,
    scope: AUTO_ARCHIVE_SENDER_SCOPE.ADDRESS,
    senderPattern,
    senderDisplay: senderPattern,
    emails: Object.entries(templates).flatMap(generate).sort(byReceivedAt),
  };
}

/** The sender groups the miner would build for this mailbox. */
export function buildRealisticMailbox() {
  return {
    github: group("hmac-github", GITHUB, GITHUB_TEMPLATES),
    sentry: group("hmac-sentry", SENTRY, SENTRY_TEMPLATES),
    colleague: group("hmac-colleague", COLLEAGUE.from, {
      colleague: COLLEAGUE,
    }),
    digest: group("hmac-digest", DIGEST.from, { digest: DIGEST }),
  };
}
