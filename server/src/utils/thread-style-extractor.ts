/**
 * Utility functions for extracting communication style from email threads.
 * Used to make follow-up emails sound more natural by matching the recipient's style.
 */

const LAST_LINES_TO_CHECK = 10;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 20;
const FIRST_LINES_TO_CHECK = 5;

/**
 * Clean HTML content from email body for text analysis.
 * Converts BR tags to newlines, strips other HTML tags, and decodes common HTML entities.
 */
function cleanEmailBody(emailBody: string): string {
  return (
    emailBody
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      // Decode `&amp;` LAST so `&amp;lt;` becomes `&lt;`, not `<` (double-escaping, CWE-116).
      .replace(/&amp;/g, "&")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim()
  );
}

/**
 * Common greeting words that we want to detect and mirror
 */
const GREETING_PATTERNS = [
  "hey",
  "hi",
  "hello",
  "dear",
  "good morning",
  "good afternoon",
  "good evening",
];

/**
 * Common sign-off patterns to extract names from
 * Supports names with hyphens (Mary-Anne), apostrophes (O'Malley), and mixed case (McFly)
 */
const SIGNOFF_PATTERNS = [
  /(?:thanks|thank you|thx|cheers|regards|best|warm regards|kind regards|sincerely|all the best),?\s*\n+\s*([A-Z][a-zA-Z'-]+)(?:\s|$|\.|\n)/im,
  /(?:thanks|thank you|thx|cheers),?\s+([A-Z][a-zA-Z'-]+)(?:\s|$|\.|\n)/im,
  /^([A-Z][a-zA-Z'-]+)$/m,
  /\n\s*-\s*([A-Z][a-zA-Z'-]+)(?:\s|$)/m,
  /\n\s*([A-Z][a-zA-Z'-]+)\s*$/m,
];

/**
 * Words that should not be considered as names
 */
const EXCLUDED_WORDS = new Set([
  "thanks",
  "thank",
  "best",
  "regards",
  "sincerely",
  "cheers",
  "warm",
  "kind",
  "all",
  "the",
  "sent",
  "from",
  "iphone",
  "android",
  "outlook",
  "gmail",
  "mail",
  "bearlymail",
  "unsubscribe",
  "reply",
  "forward",
  "subject",
  "attached",
  "attachment",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

export interface ThreadStyleInfo {
  preferredName: string | null;
  greetingStyle: string | null;
}

/**
 * Extract the recipient's preferred name from their sign-off in emails.
 * Looks for patterns like "Thanks, Sam" or just "Sam" at the end of emails.
 *
 * @param emailBody - The body of an email from the recipient
 * @returns The extracted first name or null if not found
 */
export function extractSignOffName(emailBody: string): string | null {
  if (!emailBody || emailBody.trim().length === 0) {
    return null;
  }

  const cleanedBody = cleanEmailBody(emailBody);
  const lines = cleanedBody.split("\n");
  const lastLines = lines.slice(-LAST_LINES_TO_CHECK).join("\n");

  for (const pattern of SIGNOFF_PATTERNS) {
    const match = lastLines.match(pattern);
    if (match?.[1]) {
      const potentialName = match[1].trim();
      if (
        potentialName.length >= MIN_NAME_LENGTH &&
        potentialName.length <= MAX_NAME_LENGTH &&
        !EXCLUDED_WORDS.has(potentialName.toLowerCase()) &&
        /^[A-Z][a-zA-Z'-]+$/.test(potentialName)
      ) {
        return potentialName;
      }
    }
  }

  return null;
}

/**
 * Extract how the recipient greets the user in their emails.
 * Looks for patterns like "Hey Jeremy," or "Hi there,"
 *
 * @param emailBody - The body of an email from the recipient
 * @param userName - The user's name to look for in greetings
 * @returns The greeting style (e.g., "Hey", "Hi", "Hello") or null
 */
export function extractGreetingStyle(
  emailBody: string,
  userName?: string,
): string | null {
  if (!emailBody || emailBody.trim().length === 0) {
    return null;
  }

  const cleanedBody = cleanEmailBody(emailBody);
  const firstLines = cleanedBody
    .split("\n")
    .slice(0, FIRST_LINES_TO_CHECK)
    .join("\n")
    .trim();

  for (const greeting of GREETING_PATTERNS) {
    const pattern = new RegExp(`^\\s*${greeting}(?:\\s+\\w+)?\\s*[,!]?`, "im");
    if (pattern.test(firstLines)) {
      return greeting.charAt(0).toUpperCase() + greeting.slice(1);
    }
  }

  if (userName) {
    const firstName = userName.split(/\s+/)[0];
    // nosemgrep
    const namePattern = new RegExp(
      `^\\s*(\\w+)\\s+${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,!]?`,
      "im",
    );
    const match = firstLines.match(namePattern);
    if (match?.[1]) {
      const greeting = match[1].toLowerCase();
      if (
        GREETING_PATTERNS.some((greetingWord) =>
          greetingWord.startsWith(greeting),
        )
      ) {
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }
    }
  }

  return null;
}

/**
 * Analyze a thread to extract communication style information.
 * Looks at the recipient's messages to determine:
 * - How they sign off (their preferred name)
 * - How they greet the user (greeting style to mirror)
 *
 * @param recipientMessages - Array of email bodies from the recipient (most recent first)
 * @param userName - The user's name (to detect greeting patterns)
 * @returns Style information extracted from the thread
 */
export function analyzeThreadStyle(
  recipientMessages: Array<{ body: string }>,
  userName?: string,
): ThreadStyleInfo {
  let preferredName: string | null = null;
  let greetingStyle: string | null = null;

  for (const message of recipientMessages) {
    if (!preferredName) {
      preferredName = extractSignOffName(message.body);
    }

    if (!greetingStyle) {
      greetingStyle = extractGreetingStyle(message.body, userName);
    }

    if (preferredName && greetingStyle) {
      break;
    }
  }

  return { preferredName, greetingStyle };
}
