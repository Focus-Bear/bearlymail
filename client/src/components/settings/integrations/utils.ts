export function validateRepoString(repo: string): boolean {
  // Accept strings like owner/repo or single repo name (owner required by UI elsewhere)
  const trimmed = repo.trim();
  if (!trimmed) {
    return false;
  }
  // Basic owner/repo validation: owner and repo are 1-100 chars of alphanum, -, _ or .
  const ownerRepoRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  return ownerRepoRegex.test(trimmed);
}

export function parseOwnerRepo(repoString: string): { owner: string; repo: string } | null {
  const parts = repoString
    .trim()
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (parts.length === 1) {
    // No owner provided
    return null;
  }
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}
