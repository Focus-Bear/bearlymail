/**
 * Recovers the structural facts of a GitHub notification email — item (PR /
 * issue), event (comment, merged, review requested, …), actor kind (bot /
 * human) and the "You are receiving this because …" reason — from text that
 * is already stored on the email row. No header capture is needed:
 *   - the From display name IS the acting GitHub login (`dependabot[bot]`,
 *     `octocat`), so the actor kind is the `[bot]` suffix / known-bot list;
 *   - every notification template opens with a fixed phrase (`Merged #430
 *     into main.`, `@octocat requested your review on: #430 …`, `@octocat left
 *     a comment (…)`) that identifies the event;
 *   - the footer mirrors the `X-GitHub-Reason` header.
 *
 * These facts are what GitHub-heavy mailboxes split their categories on, so
 * they are encoded into the fine-grained notification subtype
 * (`github:<item>:<event>:<actor>`) that composite category rules can pin.
 */
import {
  GITHUB_ACTOR_KINDS,
  GITHUB_BOT_LOGIN_SUFFIX,
  GITHUB_NOTIFICATION_EVENTS,
  GITHUB_NOTIFICATION_ITEMS,
  GITHUB_NOTIFICATION_REASONS,
  GithubActorKind,
  GithubNotificationEvent,
  GithubNotificationReason,
  KNOWN_GITHUB_BOT_LOGINS,
} from "../constants/github-notification.constants";
import { isGitHubNotificationEmail } from "./github.service";
import {
  detectGithubLinkType,
  GithubNotificationLinkType,
} from "./github-link-type.util";

export interface GithubNotificationFacts {
  item: GithubNotificationLinkType;
  event: GithubNotificationEvent;
  actorKind: GithubActorKind;
  /** The acting GitHub login when it could be read; null otherwise. */
  actorLogin: string | null;
  /** Why the user received the notification, when the footer says so. */
  reason: GithubNotificationReason | null;
}

/** Segment separator inside a subtype (`github:pr:merged:human`). */
export const GITHUB_SUBTYPE_SEPARATOR = ":";

/** Bounds regex work on pathological bodies; openers/footers sit well within it. */
const MAX_SCAN_CHARS = 20000;

const HTML_TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;
const REPLY_PREFIX_PATTERN = /^\s*(?:re|fwd?|aw|sv)\s*:/i;
const SUBJECT_PR_MARKER_PATTERN = /\(PR #\d+\)/i;
const SUBJECT_ISSUE_MARKER_PATTERN = /\(Issue #\d+\)/i;
const FROM_DISPLAY_NAME_PATTERN = /^\s*"?([^"<]+?)"?\s*<[^>]+>/;
/** The `@login` immediately before an event verb, for From headers with no display name. */
const OPENER_LOGIN_PATTERN =
  /@([A-Za-z0-9-]+(?:\[bot\])?)\s+(?:left a comment|commented on|approved|requested|pushed|assigned|mentioned)\b/i;

// GitHub Actions run notifications use the subject skeleton
// "[owner/repo] Run <status>: <workflow> …". The run status is a clean,
// deterministic sub-stream — far more separable than PR-vs-issue, which real
// mailboxes routinely mislabel.
const CI_RUN_STATUS_PATTERN =
  /\brun\s+(failed|cancelled|canceled|succeeded|passed|errored|timed out|startup failure)\b/i;

/**
 * Event openers in precedence order. Review verdicts precede the generic
 * comment marker (an approval email never says "left a comment", but a review
 * comment says "commented on this pull request"); the comment marker precedes
 * the state-change openers so a comment that QUOTES "Merged #12 into main" is
 * still a comment.
 */
const EVENT_OPENERS: ReadonlyArray<{
  event: GithubNotificationEvent;
  pattern: RegExp;
}> = [
  {
    event: GITHUB_NOTIFICATION_EVENTS.OPENED,
    pattern: /you can view, comment on, or merge this pull request online at/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.REVIEW_REQUESTED,
    pattern: /\brequested your review on\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.REVIEW_APPROVED,
    pattern: /\bapproved this pull request\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.CHANGES_REQUESTED,
    pattern: /\brequested changes on this pull request\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.COMMENT,
    pattern: /\bleft a comment\b|\bcommented on this (?:pull request|issue)\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.PUSH,
    pattern: /\bpushed \d+ commits?\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.MERGED,
    pattern: /\bmerged #\d+ into\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.CLOSED,
    pattern: /\bclosed #\d+(?: as (?:completed|not planned))?(?=[.\s]|$)/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.REOPENED,
    pattern: /\breopened #\d+/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.ASSIGNED,
    pattern: /\bassigned #\d+ to @|\bassigned you\b/i,
  },
  {
    event: GITHUB_NOTIFICATION_EVENTS.MENTIONED,
    pattern: /\bmentioned you\b/i,
  },
];

/** Footer phrases (after "You are receiving this because") → reason. */
const REASON_FOOTERS: ReadonlyArray<{
  reason: GithubNotificationReason;
  pattern: RegExp;
}> = [
  {
    reason: GITHUB_NOTIFICATION_REASONS.TEAM_MENTION,
    pattern:
      /receiving this because you (?:are|were) on a team that was mentioned/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.MENTION,
    pattern: /receiving this because you were mentioned/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.REVIEW_REQUESTED,
    pattern: /receiving this because your review was requested/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.AUTHOR,
    pattern: /receiving this because you authored the thread/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.SUBSCRIBED,
    pattern: /receiving this because you are subscribed to this thread/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.ASSIGN,
    pattern: /receiving this because you were assigned/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.COMMENT,
    pattern: /receiving this because you commented/i,
  },
  {
    reason: GITHUB_NOTIFICATION_REASONS.STATE_CHANGE,
    pattern: /receiving this because you modified the open\/close state/i,
  },
];

/**
 * Plain text to scan for openers and footers: the plain body plus the HTML
 * part with tags stripped, whitespace-collapsed. The HTML part matters because
 * the issue-comment template only says "left a comment" in its HTML.
 */
function scanText(body?: string | null, htmlBody?: string | null): string {
  const html = (htmlBody ?? "")
    .slice(0, MAX_SCAN_CHARS)
    .replace(HTML_TAG_PATTERN, " ");
  return `${(body ?? "").slice(0, MAX_SCAN_CHARS)} ${html}`
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

/** The GitHub login in the From display name (`"octocat" <notifications@…>`), or null. */
export function parseGithubActorLogin(from: string): string | null {
  const display = from.match(FROM_DISPLAY_NAME_PATTERN)?.[1]?.trim();
  return display ? display : null;
}

/** True for `[bot]`-suffixed App accounts and the known bare-login automations. */
export function isGithubBotLogin(login: string): boolean {
  const normalised = login.trim().toLowerCase();
  return (
    normalised.endsWith(GITHUB_BOT_LOGIN_SUFFIX) ||
    KNOWN_GITHUB_BOT_LOGINS.includes(normalised)
  );
}

function detectActorLogin(from: string, text: string): string | null {
  return (
    parseGithubActorLogin(from) ?? text.match(OPENER_LOGIN_PATTERN)?.[1] ?? null
  );
}

/**
 * The event named by the body opener, else `opened` for a thread's first
 * message (no reply prefix on the subject — GitHub adds "Re:" to every
 * follow-up notification), else `other`.
 */
export function detectGithubNotificationEvent(
  subject: string,
  text: string,
): GithubNotificationEvent {
  const opener = EVENT_OPENERS.find(({ pattern }) => pattern.test(text));
  if (opener) {
    return opener.event;
  }
  return REPLY_PREFIX_PATTERN.test(subject || "")
    ? GITHUB_NOTIFICATION_EVENTS.OTHER
    : GITHUB_NOTIFICATION_EVENTS.OPENED;
}

/** The reason stated by the "You are receiving this because …" footer, or null. */
export function detectGithubNotificationReason(
  text: string,
): GithubNotificationReason | null {
  return (
    REASON_FOOTERS.find(({ pattern }) => pattern.test(text))?.reason ?? null
  );
}

/**
 * PR vs issue from the canonical URL, falling back to the `(PR #N)` /
 * `(Issue #N)` subject marker GitHub appends to every notification subject.
 */
function detectItem(
  from: string,
  subject: string,
  body?: string | null,
  htmlBody?: string | null,
): GithubNotificationLinkType | null {
  const fromUrl = detectGithubLinkType(from, body, htmlBody);
  if (fromUrl) {
    return fromUrl;
  }
  if (SUBJECT_PR_MARKER_PATTERN.test(subject || "")) {
    return GITHUB_NOTIFICATION_ITEMS.PR;
  }
  if (SUBJECT_ISSUE_MARKER_PATTERN.test(subject || "")) {
    return GITHUB_NOTIFICATION_ITEMS.ISSUE;
  }
  return null;
}

/**
 * Detects the structural facts of a GitHub PR/issue notification. Null when
 * the sender is not GitHub or neither a canonical PR/issue URL nor a subject
 * marker identifies the item. CI run notifications are not PR/issue facts —
 * see {@link detectGithubSubtype}.
 */
export function detectGithubNotificationFacts(
  from: string,
  subject: string,
  body?: string | null,
  htmlBody?: string | null,
): GithubNotificationFacts | null {
  if (!isGitHubNotificationEmail(from)) {
    return null;
  }
  const item = detectItem(from, subject, body, htmlBody);
  if (!item) {
    return null;
  }
  const text = scanText(body, htmlBody);
  const actorLogin = detectActorLogin(from, text);
  return {
    item,
    event: detectGithubNotificationEvent(subject, text),
    actorKind:
      actorLogin && isGithubBotLogin(actorLogin)
        ? GITHUB_ACTOR_KINDS.BOT
        : GITHUB_ACTOR_KINDS.HUMAN,
    actorLogin,
    reason: detectGithubNotificationReason(text),
  };
}

/** `pr:merged:human` — the fine-grained subtype (before platform namespacing). */
export function buildGithubNotificationSubtype(
  facts: GithubNotificationFacts,
): string {
  return [facts.item, facts.event, facts.actorKind].join(
    GITHUB_SUBTYPE_SEPARATOR,
  );
}

/**
 * Detects the fine-grained GitHub notification sub-stream: a CI run status
 * (`ci:run_failed`) when present, else `<item>:<event>:<actor>` for PR/issue
 * notifications (`pr:comment:bot`, `issue:closed:human`), else null. CI status
 * is checked first because it is the cleanest separator.
 */
export function detectGithubSubtype(
  from: string,
  subject: string,
  body?: string | null,
  htmlBody?: string | null,
): string | null {
  if (!isGitHubNotificationEmail(from)) {
    return null;
  }
  const ciMatch = (subject || "").match(CI_RUN_STATUS_PATTERN);
  if (ciMatch) {
    const status = ciMatch[1].toLowerCase().replace(WHITESPACE_PATTERN, "_");
    return [GITHUB_NOTIFICATION_ITEMS.CI, `run_${status}`].join(
      GITHUB_SUBTYPE_SEPARATOR,
    );
  }
  const facts = detectGithubNotificationFacts(from, subject, body, htmlBody);
  return facts ? buildGithubNotificationSubtype(facts) : null;
}
