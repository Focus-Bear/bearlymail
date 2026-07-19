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

/** Resolve an LLM response's category: prefer `categoryNumber` (exact index), else the returned `category` name (defensive; e.g. an older response shape). */
export function resolveResponseCategory(
  analysisResult: { categoryNumber?: unknown; category?: string },
  orderedNames: string[],
): string {
  return hasCategoryNumber(analysisResult.categoryNumber)
    ? resolveCategoryNumber(analysisResult.categoryNumber, orderedNames)
    : analysisResult.category || "Other";
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
