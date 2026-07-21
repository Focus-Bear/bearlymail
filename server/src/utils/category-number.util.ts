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
 * Resolve an LLM response's category.
 *
 * Primary path: prefer `categoryNumber` — an exact 1-based index into the
 * numbered list (0 / out-of-range → "Other").
 *
 * Defensive path: when the model disobeys and reports a NAME instead of a
 * number, recover the pick ONLY by an exact (normalised) match back into the
 * numbered list. A name that isn't in the list resolves to "Other" — we never
 * fall back to fuzzy/prefix name matching, which re-routes fabricated near-names
 * (e.g. "New GitHub Bug Reports" ≈ "New Github issues raised by QAs") into the
 * wrong category or a bogus proto. "Other" is the honest outcome for a pick the
 * model invented rather than selecting from the list.
 */
export function resolveResponseCategory(
  analysisResult: { categoryNumber?: unknown; category?: string },
  orderedNames: string[],
): string {
  if (hasCategoryNumber(analysisResult.categoryNumber)) {
    return resolveCategoryNumber(analysisResult.categoryNumber, orderedNames);
  }
  const name = analysisResult.category?.trim();
  if (!name || name === "Other") return "Other";
  const target = normaliseForExactMatch(name);
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
