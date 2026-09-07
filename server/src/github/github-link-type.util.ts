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
