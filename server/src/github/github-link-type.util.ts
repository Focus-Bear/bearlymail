import { GITHUB_LINK_TYPES } from "../constants/domain-types";
import { isGitHubNotificationEmail } from "./github.service";

/**
 * The structural notification type of a GitHub email: whether it concerns a
 * pull request or an issue. Derived deterministically from the canonical
 * `github.com/{owner}/{repo}/pull|issues/{n}` URL that GitHub always embeds in
 * notification emails, so it is a far stronger category separator for GitHub
 * senders than the fuzzy subject/body phrases the LLM extracts (all GitHub
 * sub-categories share the same `*@github.com` sender and similar wording).
 */
export type GithubNotificationLinkType =
  | typeof GITHUB_LINK_TYPES.PR
  | typeof GITHUB_LINK_TYPES.ISSUE;

const PR_URL_PATTERN = /github\.com\/[^/\s"'<>]+\/[^/\s"'<>]+\/pull\/\d+/i;
const ISSUE_URL_PATTERN = /github\.com\/[^/\s"'<>]+\/[^/\s"'<>]+\/issues\/\d+/i;

/**
 * Detects whether a GitHub notification email is about a pull request or an
 * issue. Returns null when the sender is not a GitHub notification address or
 * no canonical PR/issue URL can be found.
 *
 * Both the plain-text body and the raw HTML (including `href` attributes) are
 * scanned, because GitHub often exposes the canonical URL only inside an
 * anchor's `href` — this is why detection runs on the RAW email rather than the
 * href-stripped `bodyTextForMatch`. When both a PR and an issue URL appear
 * (e.g. a PR that references an issue) the PR classification wins, since the
 * notification itself is about the PR.
 */
export function detectGithubLinkType(
  from: string,
  body?: string | null,
  htmlBody?: string | null,
): GithubNotificationLinkType | null {
  if (!isGitHubNotificationEmail(from)) {
    return null;
  }
  const haystack = `${body ?? ""}\n${htmlBody ?? ""}`;
  if (PR_URL_PATTERN.test(haystack)) {
    return GITHUB_LINK_TYPES.PR;
  }
  if (ISSUE_URL_PATTERN.test(haystack)) {
    return GITHUB_LINK_TYPES.ISSUE;
  }
  return null;
}

// GitHub Actions run notifications use the subject skeleton
// "[owner/repo] Run <status>: <workflow> …". The run status is a clean,
// deterministic sub-stream — far more separable than PR-vs-issue, which real
// mailboxes routinely mislabel.
const CI_RUN_STATUS_PATTERN =
  /\brun\s+(failed|cancelled|canceled|succeeded|passed|errored|timed out|startup failure)\b/i;

/**
 * Detects the fine-grained GitHub notification sub-stream: a CI run status
 * (`ci:run_failed`) when present, else the PR/issue link type (`pr` / `issue`),
 * else null. CI status is checked first because it is the cleanest separator.
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
    const status = ciMatch[1].toLowerCase().replace(/\s+/g, "_");
    return `ci:run_${status}`;
  }
  return detectGithubLinkType(from, body, htmlBody);
}
