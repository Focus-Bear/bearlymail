/**
 * Quick keyword check to see if email content mentions GitHub.
 * This is a synchronous, best-effort check — the authoritative guard in
 * GitHubStatusSection also shows the card when the server returned links
 * (see serverFoundLinks check), so false-negatives here are non-fatal.
 */
export function emailMentionsGitHub(subject?: string, body?: string, htmlBody?: string, from?: string): boolean {
  // GitHub notification emails come from @github.com addresses, including:
  //   notifications@github.com, noreply@github.com, {repo}@noreply.github.com
  if (from && /@(?:.*\.)?github\.com>?\s*$/i.test(from)) {
    return true;
  }
  const searchText = `${subject || ''} ${body || ''} ${htmlBody || ''}`.toLowerCase();
  // Match "github" in any form including github.com URLs, GitHub Actions, etc.
  return (
    searchText.includes('github') ||
    searchText.includes('pull request') ||
    searchText.includes('gh-') ||
    searchText.includes('/issues/') ||
    searchText.includes('/pull/')
  );
}
