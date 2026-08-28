/** Resolve a 1-based LLM category selection (0 = Other) by exact list index. */
export function resolveCategoryNumber(
  raw: unknown,
  orderedNames: string[],
): string {
  let parsed = NaN;
  if (typeof raw === "number") {
    parsed = raw;
  } else if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    parsed = Number(raw.trim());
  }
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > orderedNames.length) {
    return "Other";
  }
  return orderedNames[parsed - 1];
}

/** Prefer categoryNumber; tolerate only an exact listed name from older models. */
export function resolveResponseCategory(
  result: { categoryNumber?: unknown; category?: string },
  orderedNames: string[],
): string {
  if (result.categoryNumber !== undefined && result.categoryNumber !== null) {
    return resolveCategoryNumber(result.categoryNumber, orderedNames);
  }
  const rawName = result.category?.trim();
  if (!rawName || rawName === "Other") return "Other";
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const target = normalize(rawName);
  return orderedNames.find((name) => normalize(name) === target) ?? "Other";
}
