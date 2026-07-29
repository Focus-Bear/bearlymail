/**
 * General "notification subtype" resolver.
 *
 * Problem it solves: uniform-notification platforms (GitHub, GitLab, Jira,
 * Linear, Slack, Sentry, PagerDuty, …) send everything from ONE domain but cover
 * many distinct sub-streams. Sender-based categorisation and sender+phrase
 * deterministic rules therefore can't separate a PR-update from an issue-comment
 * from a CI-failure — they collapse into false positives against each other.
 *
 * This resolver recovers a stable, fine-grained sub-stream key ("subtype") from
 * the raw email, so a composite rule can pin itself to ONE sub-stream (an AND
 * condition) instead of leaning on brittle phrase exclusions. It is deliberately
 * platform-agnostic:
 *   1. Platform-specific resolvers, keyed off the shared `PLATFORM_PINNING`
 *      registry, run first. GitHub is the first concrete entry (PR vs issue,
 *      via the canonical `github.com/.../pull|issues/N` URL — the same signal
 *      that builds `EmailThread.githubMetadata`).
 *   2. A general structural-subject-skeleton fallback handles every other
 *      sender: it keys off the `[tag]` / `(TICKET-123)` prefix that virtually
 *      all notification platforms put at the front of the subject, with numbers
 *      normalised so per-ticket subjects collapse to one sub-stream.
 *
 * The same util is intended to be shared with the local-model notification
 * subtype feature so both derive subtypes identically.
 */
import {
  platformForSender,
  senderDomain,
} from "../constants/platform-pinning.constants";
import { detectGithubSubtype } from "../github/github-link-type.util";

export interface NotificationSubtypeInput {
  from: string;
  subject: string;
  body?: string | null;
  htmlBody?: string | null;
}

/** Platform-specific subtype resolvers, keyed by `PLATFORM_PINNING` entry id. */
type PlatformSubtypeResolver = (
  input: NotificationSubtypeInput,
) => string | null;

const PLATFORM_SUBTYPE_RESOLVERS: Record<string, PlatformSubtypeResolver> = {
  github: (input) =>
    detectGithubSubtype(input.from, input.subject, input.body, input.htmlBody),
};

const SUBJECT_TAG_PATTERN = /^[[(]([^\])]{1,60})[\])]/;
const REPLY_PREFIX_PATTERN = /^(?:re|fwd|fw)\s*:\s*/i;
const MIN_SKELETON_TAG_LENGTH = 2;

/**
 * Derives a sub-stream key from the subject's leading `[tag]` / `(tag)` marker,
 * with digits collapsed to `#` so per-ticket/per-run subjects share one key
 * (`(PROJ-123)` and `(PROJ-988)` → `proj-#`). Returns null when the subject has
 * no such structural prefix — the common case for ordinary mail, so ordinary
 * senders get no constraint and behave exactly as before.
 */
export function structuralSubjectSubtype(subject: string): string | null {
  const cleaned = (subject || "").replace(REPLY_PREFIX_PATTERN, "").trim();
  const match = cleaned.match(SUBJECT_TAG_PATTERN);
  if (!match) return null;
  const tag = match[1]
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  if (tag.length < MIN_SKELETON_TAG_LENGTH) return null;
  return `tag:${tag}`;
}

/**
 * Resolves the notification subtype for an email, or null when none applies.
 *
 * Values are namespaced by platform id (`github:pr`, `atlassian:tag:proj-#`,
 * `tag:build-#`) so they are readable and never collide across platforms. The
 * exact string is opaque to callers — all that matters is that the SAME email
 * sub-stream always resolves to the SAME string, so a rule pinned to it matches
 * future emails in that sub-stream and nothing else.
 */
export function resolveNotificationSubtype(
  input: NotificationSubtypeInput,
): string | null {
  const platform = platformForSender(input.from);
  const platformId = platform?.id;

  if (platformId) {
    const resolver = PLATFORM_SUBTYPE_RESOLVERS[platformId];
    const platformSubtype = resolver?.(input) ?? null;
    const subtype = platformSubtype ?? structuralSubjectSubtype(input.subject);
    return subtype ? `${platformId}:${subtype}` : null;
  }

  // Unrecognised sender: fall back to the general structural-subject skeleton so
  // any notification-style sender still gets sub-stream separation.
  if (senderDomain(input.from)) {
    return structuralSubjectSubtype(input.subject);
  }
  return null;
}
