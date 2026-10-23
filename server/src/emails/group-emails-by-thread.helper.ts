/** The entity types `emailThreadId` as string, but legacy rows can lack one. */
interface ThreadedEmail {
  id: string;
  emailThreadId?: string | null;
}

/**
 * Groups emails by their thread, keeping first-seen thread order and each
 * thread's emails in input order, so per-thread work can run concurrently
 * across threads while staying sequential within one. An email with no
 * thread is its own group (it shares state with nothing).
 */
export function groupEmailsByThread<T extends ThreadedEmail>(
  emails: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const email of emails) {
    const groupKey = email.emailThreadId || email.id;
    const group = groups.get(groupKey);
    if (group) {
      group.push(email);
    } else {
      groups.set(groupKey, [email]);
    }
  }
  return [...groups.values()];
}
