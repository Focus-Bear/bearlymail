/**
 * Resolves the `categoryNumber` the LLM returns (a 1-based index into the
 * numbered "Available Categories" list, or 0 for Other) back to the exact
 * stored category name.
 *
 * This replaces free-text name matching: the LLM picks from a closed numbered
 * set, so resolution is an exact array index — no canonicalisation, no
 * emoji/fuzzy comparison, no proto mis-routing. Anything that isn't a valid
 * 1..N integer (0, out of range, non-numeric, null) resolves to "Other" rather
 * than guessing.
 *
 * @param raw          the `categoryNumber` field from the LLM response
 * @param orderedNames the category display names in the exact order they were
 *                     numbered in the prompt (index 0 === number 1)
 */
export function resolveCategoryNumber(
  raw: unknown,
  orderedNames: string[],
): string {
  let parsedNumber = NaN;
  if (typeof raw === "number") {
    parsedNumber = raw;
  } else if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    parsedNumber = Number(raw.trim());
  }
  if (
    !Number.isInteger(parsedNumber) ||
    parsedNumber < 1 ||
    parsedNumber > orderedNames.length
  ) {
    return "Other";
  }
  return orderedNames[parsedNumber - 1];
}

/** True when the LLM response carries a usable `categoryNumber` field. */
export function hasCategoryNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && /^\d+$/.test(value.trim());
}

/**
 * Normalises a category name for an EXACT (not fuzzy) comparison: lower-cased,
 * emoji/symbol-stripped, whitespace-collapsed. Used only to recover a number
 * when the model reports its pick as a name — never for near-match/prefix/
 * Levenshtein/embedding matching, which is exactly the mis-routing the numbered
 * list exists to eliminate.
 */
function normaliseForExactMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact (normalised) match of a model-reported category NAME back into the
 * numbered list. Returns the listed name, or null when the name is absent,
 * "Other", or not an exact match (a fabricated/near name — never fuzzy-matched).
 */
/** `normaliseForExactMatch("Other")` — the catch-all is handled via the number, not the name. */
const OTHER_NORMALISED = "other";

function resolveExactListedName(
  rawName: unknown,
  orderedNames: string[],
): string | null {
  if (typeof rawName !== "string") return null;
  const trimmed = rawName.trim();
  if (!trimmed || normaliseForExactMatch(trimmed) === OTHER_NORMALISED) {
    return null;
  }
  const target = normaliseForExactMatch(trimmed);
  return (
    orderedNames.find((listed) => normaliseForExactMatch(listed) === target) ??
    null
  );
}

/**
 * Resolve an LLM response's category, reconciling the model's `categoryName`
 * against its `categoryNumber`.
 *
 * Weak models (e.g. Nova Lite) reliably NAME the category their reasoning is
 * about, but frequently mis-emit the positional NUMBER — so trusting the bare
 * integer routed emails into an unrelated category while the explanation named
 * the right one. Therefore:
 *
 * 1. If `categoryName` EXACTLY matches a listed category, trust it — this is the
 *    category the model actually reasoned about, regardless of the number.
 * 2. Otherwise fall back to `categoryNumber` (exact 1-based index; 0 / out of
 *    range → "Other").
 * 3. Legacy defensive path: an older response that reported a name only in
 *    `category` with no number, matched exactly back into the list.
 *
 * Matching is always EXACT (normalised) — never fuzzy/prefix — so a fabricated
 * near-name resolves to "Other" (via the number) rather than mis-routing.
 */
export function resolveResponseCategory(
  analysisResult: {
    categoryNumber?: unknown;
    categoryName?: string;
    category?: string;
  },
  orderedNames: string[],
): string {
  const named = resolveExactListedName(
    analysisResult.categoryName,
    orderedNames,
  );
  if (named) return named;

  if (hasCategoryNumber(analysisResult.categoryNumber)) {
    return resolveCategoryNumber(analysisResult.categoryNumber, orderedNames);
  }

  const legacyName = analysisResult.category?.trim();
  if (!legacyName || legacyName === "Other") return "Other";
  const target = normaliseForExactMatch(legacyName);
  const exact = orderedNames.find(
    (listed) => normaliseForExactMatch(listed) === target,
  );
  return exact ?? "Other";
}

/**
 * Builds the `protoCategorySuggestion` for a parsed priority response. Present
 * only when the email resolved to "Other" and the model proposed a new
 * category. The `reasoning` (why a new category over existing ones, naming the
 * closest rejects) has its positional "category N" refs rewritten to real names
 * since the reviewer never sees the numbered list.
 */
export function buildProtoSuggestionFromResponse(
  analysisResult: {
    protoCategorySuggestion?: {
      name?: string;
      description?: string;
      reasoning?: string;
    };
  },
  category: string,
  orderedNames: string[],
): { name: string; description: string; reasoning?: string } | undefined {
  const suggestion = analysisResult.protoCategorySuggestion;
  if (category !== "Other" || !suggestion) return undefined;
  return {
    name: suggestion.name || "",
    description: suggestion.description || "",
    reasoning: suggestion.reasoning
      ? rewriteCategoryNumberReferences(suggestion.reasoning, orderedNames)
      : undefined,
  };
}

/**
 * Matches positional category references in LLM free text, e.g. "category 2",
 * "Category #15". Because the prompt presents categories as a numbered list,
 * models tend to write explanations like "Chose category 2 because … Considered
 * category 1 but …" — meaningless to the user, who never sees the numbers.
 */
const CATEGORY_NUMBER_REFERENCE = /\bcategory\s+#?(\d{1,3})\b/gi;

/**
 * Rewrites positional "category N" references in an LLM explanation to the
 * actual quoted category name (N is a 1-based index into the numbered list the
 * prompt showed; 0 = "Other"). References whose number is out of range are left
 * untouched — a wrong guess would be worse than the number.
 */
export function rewriteCategoryNumberReferences(
  text: string | null | undefined,
  orderedNames: string[],
): string {
  if (!text) return "";
  return text.replace(CATEGORY_NUMBER_REFERENCE, (match, digits: string) => {
    const parsedNumber = Number(digits);
    if (parsedNumber === 0) return `"Other"`;
    if (parsedNumber >= 1 && parsedNumber <= orderedNames.length) {
      return `"${orderedNames[parsedNumber - 1]}"`;
    }
    return match;
  });
}
