/**
 * Vocabulary for the structural facts recoverable from a GitHub notification
 * email: WHAT the notification is about (item), WHAT HAPPENED (event), WHO did
 * it (actor kind) and WHY the user received it (reason, mirroring the
 * `X-GitHub-Reason` header via the "You are receiving this because …" footer).
 *
 * These are the axes real GitHub-heavy mailboxes split their categories on
 * ("Bot PR updates" vs "Human PR updates" vs "PR merged" vs "PRs awaiting your
 * review"), so they are encoded into the notification subtype
 * (`github:<item>:<event>:<actor>`) that composite category rules can pin.
 */
import { GITHUB_LINK_TYPES } from "./domain-types";

/** The kind of GitHub object a notification concerns. */
export const GITHUB_NOTIFICATION_ITEMS = {
  PR: GITHUB_LINK_TYPES.PR,
  ISSUE: GITHUB_LINK_TYPES.ISSUE,
  CI: "ci",
} as const;

export type GithubNotificationItem =
  (typeof GITHUB_NOTIFICATION_ITEMS)[keyof typeof GITHUB_NOTIFICATION_ITEMS];

/** Normalised GitHub notification events, derived from the email body opener. */
export const GITHUB_NOTIFICATION_EVENTS = {
  /** A new PR/issue: the thread's first message, whose body is the description. */
  OPENED: "opened",
  COMMENT: "comment",
  REVIEW_REQUESTED: "review_requested",
  REVIEW_APPROVED: "review_approved",
  CHANGES_REQUESTED: "changes_requested",
  PUSH: "push",
  MERGED: "merged",
  CLOSED: "closed",
  REOPENED: "reopened",
  ASSIGNED: "assigned",
  MENTIONED: "mentioned",
  /** A GitHub notification whose opener matched no known event template. */
  OTHER: "other",
} as const;

export type GithubNotificationEvent =
  (typeof GITHUB_NOTIFICATION_EVENTS)[keyof typeof GITHUB_NOTIFICATION_EVENTS];

/** Whether the acting GitHub account is an automation (`[bot]`) or a person. */
export const GITHUB_ACTOR_KINDS = {
  BOT: "bot",
  HUMAN: "human",
} as const;

export type GithubActorKind =
  (typeof GITHUB_ACTOR_KINDS)[keyof typeof GITHUB_ACTOR_KINDS];

/** Why the user received the notification (the `X-GitHub-Reason` values). */
export const GITHUB_NOTIFICATION_REASONS = {
  MENTION: "mention",
  REVIEW_REQUESTED: "review_requested",
  AUTHOR: "author",
  SUBSCRIBED: "subscribed",
  ASSIGN: "assign",
  COMMENT: "comment",
  STATE_CHANGE: "state_change",
  TEAM_MENTION: "team_mention",
} as const;

export type GithubNotificationReason =
  (typeof GITHUB_NOTIFICATION_REASONS)[keyof typeof GITHUB_NOTIFICATION_REASONS];

/** GitHub App accounts always carry this login suffix (`dependabot[bot]`). */
export const GITHUB_BOT_LOGIN_SUFFIX = "[bot]";

/**
 * Automation accounts that act under a bare login WITHOUT the `[bot]` suffix.
 * `Copilot` reviews/commits as "Copilot"; the others are listed defensively for
 * mailboxes where the suffix is absent from the display name.
 */
export const KNOWN_GITHUB_BOT_LOGINS: readonly string[] = [
  "copilot",
  "dependabot",
  "github-actions",
  "renovate",
];

/**
 * Lifecycle state of the PR/issue a notification is about, as reported by the
 * thread's fetched GitHub metadata (`githubMetadata.links[].status.state`).
 * A merged PR is reported as `merged` even though GitHub's REST state is
 * `closed` — the `merged` flag is folded in so rules can pin it directly.
 */
export const GITHUB_ITEM_STATES = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
} as const;

export type GithubItemState =
  (typeof GITHUB_ITEM_STATES)[keyof typeof GITHUB_ITEM_STATES];

/** `author.type` values GitHub reports for a PR/issue author. */
export const GITHUB_AUTHOR_TYPES = {
  USER: "User",
  BOT: "Bot",
  ORGANIZATION: "Organization",
} as const;

/**
 * Inline metadata refresh before categorisation: how long the category step
 * waits for a live GitHub status fetch when the thread's metadata is missing
 * or older than the email being categorised. On timeout the email is
 * categorised with whatever metadata exists; the background job still refreshes
 * the badge afterwards.
 */
export const GITHUB_METADATA_INLINE_FETCH_TIMEOUT_MS = 8000;
