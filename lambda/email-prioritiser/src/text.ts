/**
 * UTF-16-safe text helpers for prompt building.
 *
 * `String.prototype.substring` counts UTF-16 code units, so cutting an email body
 * at a fixed length can split an astral character (emoji, mathematical bold
 * letters, etc.) and leave a lone surrogate behind. `JSON.stringify` emits that as
 * a `\uD8xx` escape, which the LLM APIs reject with a 400 "invalid JSON body",
 * so every retry fails and the SQS message lands in the DLQ.
 */

/** A high surrogate not followed by a low one, or a low surrogate not preceded by a high one. */
const LONE_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= HIGH_SURROGATE_MIN && codeUnit <= HIGH_SURROGATE_MAX;
}

/**
 * Truncates to at most `maxUnits` UTF-16 code units without splitting a
 * surrogate pair (drops the dangling high surrogate instead).
 */
export function truncateAtCodePoint(text: string, maxUnits: number): string {
  if (text.length <= maxUnits) return text;
  const cut = text.substring(0, maxUnits);
  return isHighSurrogate(cut.charCodeAt(cut.length - 1))
    ? cut.slice(0, -1)
    : cut;
}

/** Removes unpaired surrogates so the string is well-formed UTF-16 and JSON-safe. */
export function stripLoneSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE_PATTERN, "");
}
