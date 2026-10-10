/**
 * Asserts which category a categorisation prompt picked from a LARGE numbered
 * list, resolving the model's answer exactly the way production does
 * (server/src/utils/category-number.util.ts): an exact `categoryName` match
 * wins over `categoryNumber` (weak models name their pick correctly but
 * mis-count its position in a long list), otherwise the 1-based number
 * (0 = "Other").
 *
 * Reads the numbered list from the test's own vars — `categories`
 * (categorise-summary shape: `N. Name — description`) or `emailCategories`
 * (prioritise-email shape: `N. "Name": description`) — so the assertion never
 * has to hard-code list positions.
 *
 * config:
 *   expected:  string[]  — chosen category must be one of these names
 *   forbidden: string[]  — chosen category must be none of these (checked first
 *                          so the failure reason names the specific bad pick)
 */

const OTHER_CATEGORY_NAME = 'Other';

/**
 * Parse the numbered list into the text of each entry (everything after `N. `),
 * index 0 === number 1. Entries are kept whole rather than split into name +
 * description because the categorise-summary shape (`Name — desc`) is
 * ambiguous when a real category NAME itself contains " — ".
 */
function parseNumberedEntries(listText) {
  const entries = [];
  for (const line of String(listText || '').split('\n')) {
    const match = line.match(/^\s*\d+\.\s*(.+?)\s*$/);
    if (match) entries.push(match[1]);
  }
  return entries;
}

/** Normalise for EXACT (not fuzzy) comparison — lower-case, emoji/space-stripped. */
function normaliseForExactMatch(name) {
  return String(name)
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every name a list entry could be read as: the quoted name for `"Name": desc`,
 * otherwise each prefix ending at a ` — ` / ` - ` boundary plus the whole entry
 * (so `Name — desc` resolves even when the NAME itself contains " — ").
 */
function entryNameCandidates(entry) {
  const quoted = entry.match(/^"([^"]+)"/);
  if (quoted) return [quoted[1]];
  const candidates = [entry];
  const separator = /\s+[—-]\s+/g;
  let match;
  while ((match = separator.exec(entry)) !== null) candidates.push(entry.slice(0, match.index));
  return candidates;
}

function entryIsCategory(entry, name) {
  const target = normaliseForExactMatch(name);
  if (!target) return false;
  return entryNameCandidates(entry).some((candidate) => normaliseForExactMatch(candidate) === target);
}

/** Mirrors production: exact `categoryName` match wins, then `categoryNumber` (0 = Other). */
function resolveChosenEntry(result, entries) {
  if (typeof result.categoryName === 'string') {
    const target = result.categoryName.trim();
    if (target && normaliseForExactMatch(target) !== normaliseForExactMatch(OTHER_CATEGORY_NAME)) {
      const named = entries.find((entry) => entryIsCategory(entry, target));
      if (named) return named;
    }
  }
  const n = Number(result.categoryNumber);
  if (n === 0) return OTHER_CATEGORY_NAME;
  if (Number.isInteger(n) && n >= 1 && n <= entries.length) return entries[n - 1];
  return undefined;
}

function parseResult(output) {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON object in output: ${cleaned.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed && typeof parsed.result === 'object' && parsed.result ? parsed.result : parsed;
}

module.exports = (output, context) => {
  const config = context.config || {};
  const expected = config.expected || [];
  const forbidden = config.forbidden || [];
  const listText = context.vars.categories ?? context.vars.emailCategories;
  const entries = parseNumberedEntries(listText);
  if (entries.length === 0) {
    return { pass: false, score: 0, reason: 'Test bug: could not parse any category entries from vars' };
  }

  const result = parseResult(output);
  if (!Number.isInteger(Number(result.categoryNumber))) {
    return {
      pass: false,
      score: 0,
      reason: `Expected integer result.categoryNumber, got: ${JSON.stringify(result.categoryNumber)}`,
    };
  }

  const chosen = resolveChosenEntry(result, entries);
  const chosenLabel = chosen === undefined ? undefined : entryNameCandidates(chosen).at(-1);
  const detail = `chose "${chosenLabel}" (categoryNumber=${result.categoryNumber}, categoryName=${JSON.stringify(
    result.categoryName,
  )}, confidence=${result.categoryConfidence}); reasoning: ${result.reasoning ?? result.categoryExplanation ?? ''}`;

  if (chosen === undefined) {
    return { pass: false, score: 0, reason: `Unresolvable category — ${detail}` };
  }
  const isChosen = (name) =>
    chosen === OTHER_CATEGORY_NAME
      ? normaliseForExactMatch(name) === normaliseForExactMatch(OTHER_CATEGORY_NAME)
      : entryIsCategory(chosen, name);
  const forbiddenHit = forbidden.find(isChosen);
  if (forbiddenHit) {
    return { pass: false, score: 0, reason: `Picked FORBIDDEN category "${forbiddenHit}" — ${detail}` };
  }
  if (expected.length > 0 && !expected.some(isChosen)) {
    return {
      pass: false,
      score: 0,
      reason: `Expected one of ${JSON.stringify(expected)} — ${detail}`,
    };
  }
  return { pass: true, score: 1, reason: detail };
};
