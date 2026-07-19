import type { GitHubLinkAuthor } from 'types/email';

/**
 * GitHub's `user.type` enum value indicating an automated bot account.
 * (GitHub returns 'Bot' for first-party automation: Actions, Dependabot, etc.)
 */
export const GITHUB_AUTHOR_TYPE_BOT = 'Bot' as const;

/**
 * Map of known bot GitHub logins → human-readable display names.
 * Logins are lower-cased before lookup so the match is case-insensitive.
 */
const KNOWN_BOT_LOGINS: Record<string, string> = {
  'renovate[bot]': 'Renovate',
  'dependabot[bot]': 'Dependabot',
  'github-actions[bot]': 'GitHub Actions',
  'codeql[bot]': 'CodeQL',
  'mergify[bot]': 'Mergify',
  // Anthropic Claude — covers both the official app and common self-hosted slugs.
  'claude[bot]': 'Claude',
  'claude-code[bot]': 'Claude',
  'anthropic-claude[bot]': 'Claude',
  // Google Gemini — official app slug plus common short variant.
  'gemini-code-assist[bot]': 'Gemini',
  'gemini[bot]': 'Gemini',
};

/**
 * Resolve a display label for a PR/issue author when the author is a bot.
 *
 * Returns the friendly bot name (e.g. "Renovate") when the login matches our
 * known allowlist, the bare login (without the trailing "[bot]") for unknown
 * bots flagged by GitHub via author.type === 'Bot', and null otherwise.
 *
 * Why match on both the allowlist and `type`: GitHub marks first-party bots
 * (Actions, Dependabot) with type === 'Bot', but third-party apps installed
 * via OAuth sometimes appear as type === 'User' with a `[bot]` suffix login.
 */
export function getBotLabel(author: GitHubLinkAuthor | undefined): string | null {
  if (!author) {
    return null;
  }

  const loginKey = author.login.toLowerCase();
  const knownName = KNOWN_BOT_LOGINS[loginKey];
  if (knownName) {
    return knownName;
  }

  if (author.type === GITHUB_AUTHOR_TYPE_BOT) {
    return author.login.replace(/\[bot\]$/i, '');
  }

  return null;
}
