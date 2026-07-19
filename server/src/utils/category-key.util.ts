/**
 * Stable snake_case keys for email categories (shortlist / LLM matching).
 * Display names stay human-readable; keys avoid paraphrase mismatches.
 */

const MAX_CATEGORY_KEY_LEN = 80;

/**
 * Derive a base slug from a category display name (not guaranteed unique per user).
 */
export function baseSlugFromCategoryName(displayName: string): string {
  const ascii = displayName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const truncated = ascii.slice(0, MAX_CATEGORY_KEY_LEN).replace(/_+$/g, "");
  return truncated.length > 0 ? truncated : "category";
}

/**
 * Pick a unique categoryKey within a user, mutating `usedKeys`.
 */
export function allocateUniqueCategoryKey(
  displayName: string,
  usedKeys: Set<string>,
): string {
  const base = baseSlugFromCategoryName(displayName);
  let candidate = base;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    const suffixStr = `_${suffix}`;
    const maxBase = Math.max(1, MAX_CATEGORY_KEY_LEN - suffixStr.length);
    candidate = `${base.slice(0, maxBase)}${suffixStr}`.replace(/_+$/g, "_");
    suffix++;
  }
  usedKeys.add(candidate);
  return candidate;
}

/** Synthetic key for proto categories in prompts/shortlist (no DB column). */
export function protoCategoryKey(protoId: string): string {
  return `p_${protoId.replace(/-/g, "")}`;
}

/**
 * If the LLM returned a category id/key, map it to the canonical display name.
 */
export function resolveLlmCategoryToDisplayName(
  raw: string,
  emailCategories: Array<{ name: string; categoryKey?: string | null }>,
  protoCategories: Array<{ name: string; categoryKey?: string | null }>,
): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "Other") {
    return trimmed;
  }

  const all = [...emailCategories, ...protoCategories];
  const byKeyLower = new Map<string, string>();
  for (const item of all) {
    if (item.categoryKey) {
      byKeyLower.set(item.categoryKey.toLowerCase(), item.name);
    }
  }

  const direct = byKeyLower.get(trimmed.toLowerCase());
  if (direct) {
    return direct;
  }

  const bracket = trimmed.match(/^\[([a-z0-9_]+)\]$/i);
  if (bracket) {
    const fromBracket = byKeyLower.get(bracket[1].toLowerCase());
    if (fromBracket) {
      return fromBracket;
    }
  }

  return trimmed;
}
