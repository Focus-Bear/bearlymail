/**
 * In-memory relevance check that runs on decrypted contacts after the
 * blind-index SQL has produced candidates. The SQL matches on ANY shared
 * token hash, so it over-matches; this decides which candidates genuinely
 * match the query and how strongly, which drives the final ranking.
 *
 * Shared by production search (`ContactsService.searchContacts`) and the admin
 * diagnostic (`ContactsDebugAdminService.diagnoseSearch`) so the debug panel
 * reports exactly what users get.
 */

/**
 * Splits a field into tokens: whitespace plus the punctuation that joins words
 * inside email addresses and names (`andrew.lam-po-tang`, `jo_smith+news`).
 */
const TOKEN_SEPARATOR_PATTERN = /[\s.\-_+@'’,()]+/;

/** Splits "s3842000" into "s" / "3842000" and "team2go" into "team" / "2" / "go". */
const LETTER_DIGIT_BOUNDARY_PATTERN = /(?<=\d)(?=\D)|(?<=\D)(?=\d)/;

/** Unicode combining marks left behind by NFD decomposition (é → e + ◌́). */
const COMBINING_MARKS_PATTERN = /\p{M}/gu;

/**
 * Match strength, best first. Lower values rank higher.
 */
export enum ContactMatchTier {
  /** Name, first+last, or email local-part tokens equal the query words. */
  EXACT = 0,
  /** One field contains every query word as a token prefix, in query order. */
  ORDERED_PREFIX = 1,
  /** Every query word is a prefix of some name/email token, in any order. */
  PREFIX = 2,
  /** Every query word matches, but at least one only as a mid-token substring. */
  SUBSTRING = 3,
}

export interface ContactMatchFields {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

export type ContactQueryMatch =
  | { passes: true; tier: ContactMatchTier; reason: string }
  | { passes: false; failedWord: string | null; reason: string };

/** Lowercase, strip diacritics, trim — so "José" matches "jose". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .trim();
}

/**
 * Tokenises a name, email local-part, domain or query on whitespace, `.`,
 * `-`, `_`, `+`, `@` and letter/digit boundaries.
 */
export function tokenizeForSearch(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizeForSearch(value)
    .split(TOKEN_SEPARATOR_PATTERN)
    .flatMap((part) => part.split(LETTER_DIGIT_BOUNDARY_PATTERN))
    .filter((token) => token.length > 0);
}

interface SearchField {
  label: string;
  /** Normalised full value, for the legacy substring fallback. */
  normalized: string;
  tokens: string[];
  /** Whether equal tokens to the query words count as an exact match. */
  isExactCandidate: boolean;
}

function splitEmail(email: string): { localPart: string; domain: string } {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) return { localPart: email, domain: "" };
  return {
    localPart: email.slice(0, atIndex),
    domain: email.slice(atIndex + 1),
  };
}

function buildSearchFields(contact: ContactMatchFields): SearchField[] {
  const { localPart, domain } = splitEmail(contact.email ?? "");
  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  const candidates: Array<[string, string | null | undefined, boolean]> = [
    ["name", contact.name, true],
    ["first/last name", fullName, true],
    ["email local-part", localPart, true],
    ["email domain", domain, false],
  ];
  return candidates
    .filter(([, value]) => Boolean(value))
    .map(([label, value, isExactCandidate]) => ({
      label,
      normalized: normalizeForSearch(value as string),
      tokens: tokenizeForSearch(value),
      isExactCandidate,
    }));
}

function isPrefixOfAnyToken(word: string, tokens: string[]): boolean {
  return tokens.some((token) => token.startsWith(word));
}

function tokensEqualWords(tokens: string[], words: string[]): boolean {
  return (
    tokens.length === words.length &&
    tokens.every((token, index) => token === words[index])
  );
}

/** True when every word prefixes a token, with the tokens in word order. */
function matchesWordsInOrder(tokens: string[], words: string[]): boolean {
  let tokenIndex = 0;
  for (const word of words) {
    while (tokenIndex < tokens.length && !tokens[tokenIndex].startsWith(word)) {
      tokenIndex += 1;
    }
    if (tokenIndex >= tokens.length) return false;
    tokenIndex += 1;
  }
  return true;
}

function classifyTier(
  fields: SearchField[],
  words: string[],
): ContactMatchTier {
  if (
    fields.some(
      (field) =>
        field.isExactCandidate && tokensEqualWords(field.tokens, words),
    )
  ) {
    return ContactMatchTier.EXACT;
  }
  if (fields.some((field) => matchesWordsInOrder(field.tokens, words))) {
    return ContactMatchTier.ORDERED_PREFIX;
  }
  const allTokens = fields.flatMap((field) => field.tokens);
  if (words.every((word) => isPrefixOfAnyToken(word, allTokens))) {
    return ContactMatchTier.PREFIX;
  }
  return ContactMatchTier.SUBSTRING;
}

/**
 * Decides whether a decrypted contact matches the query in its visible fields
 * (name, first/last name, email) and how strongly.
 *
 * Every query word must match somewhere — as a prefix of any token, or (the
 * pre-existing behaviour, kept so nothing that used to match stops matching)
 * as a substring of a field. A contact with no name falls back to its email
 * tokens, so "andrew lam" matches `andrew.lam-po-tang@example.org`.
 */
export function evaluateContactQueryMatch(
  contact: ContactMatchFields,
  query: string,
): ContactQueryMatch {
  const words = tokenizeForSearch(query);
  if (words.length === 0) {
    return { passes: false, failedWord: null, reason: "query has no words" };
  }

  const fields = buildSearchFields(contact);
  const allTokens = fields.flatMap((field) => field.tokens);
  const failedWord = words.find(
    (word) =>
      !isPrefixOfAnyToken(word, allTokens) &&
      !fields.some((field) => field.normalized.includes(word)),
  );
  if (failedWord !== undefined) {
    return {
      passes: false,
      failedWord,
      reason: `"${failedWord}" matched no name/email token`,
    };
  }

  const tier = classifyTier(fields, words);
  return {
    passes: true,
    tier,
    reason: `${ContactMatchTier[tier].toLowerCase()} match on [${words.join(", ")}]`,
  };
}

export interface RankableContactMatch {
  tier: ContactMatchTier;
  /** How many blind-index query tokens the contact's stored tokens contain. */
  matchedTokenCount: number;
  contactFrequency: number;
  isFavorite: boolean;
}

/**
 * Orders matching contacts: match tier first, then blind-index token overlap,
 * then interaction frequency and favourite status as tiebreaks. Frequency is
 * deliberately NOT the primary key — a never-emailed exact match must outrank
 * a frequent partial one.
 */
export function compareContactMatches(
  left: RankableContactMatch,
  right: RankableContactMatch,
): number {
  return (
    left.tier - right.tier ||
    right.matchedTokenCount - left.matchedTokenCount ||
    right.contactFrequency - left.contactFrequency ||
    Number(right.isFavorite) - Number(left.isFavorite)
  );
}
