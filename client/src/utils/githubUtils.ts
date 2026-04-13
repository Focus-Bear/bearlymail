/**
 * Quick keyword check to see if email content mentions GitHub.
 * This is a synchronous, best-effort check — the authoritative guard in
 * GitHubStatusSection also shows the card when the server returned links
 * (see serverFoundLinks check), so false-negatives here are non-fatal.
 */
export function emailMentionsGitHub(subject?: string, body?: string, htmlBody?: string, from?: string): boolean {
  // GitHub notification emails always come from this address
  if (from?.toLowerCase().includes('notifications@github.com')) {
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
