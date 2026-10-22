import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";

/**
 * Text normalisation for the auto-archive miner.
 *
 * Templated notifications ("Run failed: CI - main (a1b2c3d)", "PR #2850 …")
 * differ only in their volatile parts — numbers, ids, hashes, URLs, branch
 * names, dates. Masking those parts makes every instance of a template collapse
 * onto the same tokens, which is what both the clustering and the keyword
 * extraction rely on. Nothing here knows about any particular sender.
 */

const URL_PATTERN = /(:\/\/|^www\.)/;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DIGIT_PATTERN = /\d/;
const LONG_HEX_PATTERN = /^[0-9a-f]{12,}$/;
const ALPHA_RUN_PATTERN = /[a-z]+/g;
const FEATURE_SPLIT_PATTERN = /[^a-z-]+/;
const EDGE_PUNCTUATION_PATTERN =
  /^[\s"'`([{<.,:;!?\-–—|]+|[\s"'`)\]}>.,:;!?\-–—|]+$/g;
const LEADING_PUNCTUATION = new Set([..."\"'`([{<.,:;!?-–—|"]);
const TRAILING_PUNCTUATION = new Set([..."\"'`)]}>.,:;!?-–—|"]);
const CLOSER_OF: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
  "<": ">",
};
const OPENER_OF: Record<string, string> = {
  "]": "[",
  ")": "(",
  "}": "{",
  ">": "<",
};
const WHITESPACE_PATTERN = /\s+/;
const LINE_BREAK_PATTERN = /\r?\n/;
const GLOB_OR_REGEX_PATTERN = /[*]|^\//;

const MAX_TOKEN_CHARS = 40;
const MIN_FEATURE_CHARS = 2;

const BRACKET_OPEN = "[";
const BRACKET_CLOSE = "]";
const PATH_SEPARATOR = "/";

/** Month and weekday names vary per instance of a dated template. */
const DATE_WORDS = new Set([
  "jan",
  "january",
  "feb",
  "february",
  "mar",
  "march",
  "apr",
  "april",
  "may",
  "jun",
  "june",
  "jul",
  "july",
  "aug",
  "august",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "nov",
  "november",
  "dec",
  "december",
  "mon",
  "monday",
  "tue",
  "tuesday",
  "wed",
  "wednesday",
  "thu",
  "thursday",
  "fri",
  "friday",
  "sat",
  "saturday",
  "sun",
  "sunday",
  "am",
  "pm",
  "utc",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "re",
  "fwd",
  "fw",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
]);

interface RawToken {
  /** Lower-cased token exactly as it appears in the text. */
  raw: string;
  /** True when the token is a volatile part (id, number, URL, branch, …). */
  masked: boolean;
}

function isBracketed(token: string): boolean {
  return token.startsWith(BRACKET_OPEN) && token.includes(BRACKET_CLOSE);
}

function stripEdgePunctuation(token: string): string {
  return token.replace(EDGE_PUNCTUATION_PATTERN, "");
}

/**
 * Trims edge punctuation from a phrase but keeps a bracket whose partner is in
 * the phrase, so "[owner/repo] bump" survives intact while "repo] bump" does not.
 */
function trimPhrase(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && LEADING_PUNCTUATION.has(text[start])) {
    const closer = CLOSER_OF[text[start]];
    if (closer && text.slice(start + 1, end).includes(closer)) break;
    start++;
  }
  while (end > start && TRAILING_PUNCTUATION.has(text[end - 1])) {
    const opener = OPENER_OF[text[end - 1]];
    if (opener && text.slice(start, end - 1).includes(opener)) break;
    end--;
  }
  return text.slice(start, end);
}

/** True when a token is a volatile part of a template and must be ignored. */
export function isVolatileToken(rawToken: string): boolean {
  const token = rawToken.toLowerCase();
  const bare = stripEdgePunctuation(token);
  if (bare.length === 0) return false;
  if (token.length > MAX_TOKEN_CHARS) return true;
  if (URL_PATTERN.test(bare) || EMAIL_PATTERN.test(bare)) return true;
  if (DIGIT_PATTERN.test(bare) || LONG_HEX_PATTERN.test(bare)) return true;
  if (DATE_WORDS.has(bare)) return true;
  return bare.includes(PATH_SEPARATOR) && !isBracketed(token);
}

function tokeniseLine(line: string): RawToken[] {
  return line
    .toLowerCase()
    .split(WHITESPACE_PATTERN)
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, masked: isVolatileToken(raw) }));
}

/** Splits text into runs of consecutive non-volatile tokens, one line at a time. */
function stableRuns(text: string): string[][] {
  const runs: string[][] = [];
  for (const line of text.split(LINE_BREAK_PATTERN)) {
    let current: string[] = [];
    for (const token of tokeniseLine(line)) {
      if (token.masked) {
        if (current.length > 0) runs.push(current);
        current = [];
        continue;
      }
      current.push(token.raw);
    }
    if (current.length > 0) runs.push(current);
  }
  return runs;
}

function hasMeaningfulWord(phrase: string): boolean {
  const words = phrase.match(ALPHA_RUN_PATTERN) ?? [];
  return words.some(
    (word) =>
      word.length >= AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_PHRASE_WORD_CHARS &&
      !STOPWORDS.has(word),
  );
}

const BRACKET_PAIRS: ReadonlyArray<[string, string]> = [
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  ["<", ">"],
];

function count(text: string, character: string): number {
  return text.split(character).length - 1;
}

/** A phrase cut through the middle of "[owner/repo]" or "(PR …)" reads as noise. */
function hasBalancedBrackets(phrase: string): boolean {
  return BRACKET_PAIRS.every(
    ([open, close]) => count(phrase, open) === count(phrase, close),
  );
}

function isUsablePhrase(phrase: string): boolean {
  return (
    phrase.length > 0 &&
    !GLOB_OR_REGEX_PATTERN.test(phrase) &&
    hasBalancedBrackets(phrase) &&
    hasMeaningfulWord(phrase)
  );
}

/**
 * Candidate keyword phrases: every 1..maxWords run of consecutive stable tokens,
 * edge punctuation trimmed. Built from the text's own tokens so each phrase is a
 * literal (case-insensitive) substring of the text — exactly what the workflow
 * engine's plain-text pattern matcher tests.
 */
export function extractPhrases(
  text: string,
  maxWords: number = AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_PHRASE_WORDS,
): Set<string> {
  const phrases = new Set<string>();
  for (const run of stableRuns(text)) {
    for (let start = 0; start < run.length; start++) {
      const limit = Math.min(run.length, start + maxWords);
      for (let end = start + 1; end <= limit; end++) {
        const phrase = trimPhrase(run.slice(start, end).join(" "));
        if (isUsablePhrase(phrase)) phrases.add(phrase);
      }
    }
  }
  return phrases;
}

/**
 * Normalised feature words for similarity: stable tokens only, split on
 * punctuation, stopwords dropped.
 */
export function featureTokens(text: string): string[] {
  const features: string[] = [];
  for (const run of stableRuns(text)) {
    for (const token of run) {
      for (const part of token.split(FEATURE_SPLIT_PATTERN)) {
        const word = stripEdgePunctuation(part);
        if (word.length >= MIN_FEATURE_CHARS && !STOPWORDS.has(word)) {
          features.push(word);
        }
      }
    }
  }
  return features;
}

/** The head of a body used for clustering and body keywords. */
export function bodyHead(body: string | null | undefined): string {
  return (body ?? "").slice(0, AUTO_ARCHIVE_PROPOSAL_CONFIG.BODY_HEAD_CHARS);
}

/**
 * A template signature: emails that differ only in volatile parts share it, so
 * the clusterer can work on distinct templates instead of every email.
 */
export function templateSignature(subject: string, body: string): string {
  const subjectPart = featureTokens(subject).join(" ");
  const bodyPart = featureTokens(bodyHead(body))
    .slice(0, AUTO_ARCHIVE_PROPOSAL_CONFIG.BODY_FEATURE_TOKENS)
    .join(" ");
  return `${subjectPart}\u0000${bodyPart}`;
}
