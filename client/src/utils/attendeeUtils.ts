/**
 * Helpers for building the default attendee list when creating a calendar invite
 * from an email. The invite should default to everyone on the thread (sender +
 * all To + all CC recipients), de-duplicated and excluding the current user.
 */

export interface Attendee {
  name: string;
  email: string;
}

// Deliberately permissive: enough to reject obviously malformed input without
// rejecting valid-but-unusual addresses. Server-side validation is authoritative.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value.trim());

/**
 * Parse a single recipient token ("Jane Doe <jane@x.com>" or "jane@x.com") into a
 * display name + lowercased email. Returns null when no valid email is present.
 */
export const parseAddress = (raw: string): Attendee | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const angleMatch = trimmed.match(/^(.*?)<([^>]+)>$/);
  if (angleMatch) {
    const email = angleMatch[2].trim().toLowerCase();
    if (!isValidEmail(email)) {
      return null;
    }
    const name = angleMatch[1].trim().replace(/^["']|["']$/g, '').trim();
    return { email, name: name || email };
  }

  const email = trimmed.toLowerCase();
  return isValidEmail(email) ? { email, name: email } : null;
};

/** Split a comma/semicolon-separated recipient header into individual tokens. */
const splitRecipients = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
};

export interface ThreadAddresses {
  from?: string;
  fromName?: string;
  to?: string;
  cc?: string;
}

/**
 * Builds the default attendee list for a calendar invite from a thread's
 * from + to + cc recipients: parses each address, de-duplicates by email, and
 * excludes the current user (they host the event rather than attend as a guest).
 * When `fromName` is provided it is used as the sender's display name.
 */
export const deriveThreadAttendees = (
  addresses: ThreadAddresses,
  userEmail: string | undefined,
): Attendee[] => {
  const normalizedUser = userEmail?.trim().toLowerCase();
  const senderTokens = splitRecipients(addresses.from);
  const tokens = [...senderTokens, ...splitRecipients(addresses.to), ...splitRecipients(addresses.cc)];

  const byEmail = new Map<string, Attendee>();
  for (const token of tokens) {
    const parsed = parseAddress(token);
    if (!parsed || parsed.email === normalizedUser || byEmail.has(parsed.email)) {
      continue;
    }
    byEmail.set(parsed.email, parsed);
  }

  // Prefer the explicit sender display name for the "from" address when present.
  if (addresses.fromName && senderTokens.length === 1) {
    const sender = parseAddress(senderTokens[0]);
    if (sender && byEmail.has(sender.email)) {
      byEmail.set(sender.email, { email: sender.email, name: addresses.fromName });
    }
  }

  return Array.from(byEmail.values());
};
