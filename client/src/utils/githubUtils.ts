/**
 * Quick keyword check to see if email content mentions GitHub
 * This is a synchronous check that should be instant
 */
export function emailMentionsGitHub(
  subject?: string,
  body?: string,
  htmlBody?: string
): boolean {
  const searchText = `${subject || ''} ${body || ''} ${htmlBody || ''}`.toLowerCase();
  return searchText.includes('github');
}
