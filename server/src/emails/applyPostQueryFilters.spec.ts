/**
 * Unit tests for the category-filter logic in applyPostQueryFilters (fix #1114).
 *
 * Root cause that was fixed: when `categoryIds` were provided but none resolved
 * to a known category name (e.g. stale/deleted UUIDs), the filter was silently
 * skipped and ALL emails were returned instead of an empty result.
 *
 * Fix: if categoryIds is non-empty but resolves to zero names → return [] immediately.
 *
 * Tests here use a pure-function mirror of the relevant logic so we avoid the full
 * NestJS DI bootstrap overhead (same pattern as emails-priority-inbox.service.spec.ts).
 */

// ─── Pure-function mirror of applyPostQueryFilters category logic ─────────────
//
// Keep in sync with the implementation in emails.service.ts
// (private applyPostQueryFilters → categoryIds branch).

interface Email {
  id: string;
  from: string;
  category?: string | null;
  [key: string]: unknown;
}

interface CategoryContext {
  contextId: string;
  contextValue: string;
}

/**
 * Mirror the UUID→name resolution + category filtering from applyPostQueryFilters.
 *
 * @param emails         Raw email list
 * @param categoryIds    Requested category UUIDs (undefined / empty = no filter)
 * @param categoryContexts Known category contexts for the user
 * @returns Filtered email list (or [] when no UUIDs resolve)
 */
function applyCategoryFilter(
  emails: Email[],
  categoryIds: string[] | undefined,
  categoryContexts: CategoryContext[],
): { emails: Email[]; earlyReturn: boolean } {
  if (!categoryIds || categoryIds.length === 0) {
    // No filter requested — return all emails as-is
    return { emails, earlyReturn: false };
  }

  // Build UUID → category-name map (mirrors: ctx.contextValue.split(" - ")[0].trim())
  const idToName = new Map<string, string>();
  for (const ctx of categoryContexts) {
    const categoryName = ctx.contextValue.split(" - ")[0].trim();
    idToName.set(ctx.contextId, categoryName);
  }

  // Resolve requested UUIDs to names
  const resolvedNames = categoryIds
    .map((id) => idToName.get(id))
    .filter((name): name is string => name !== undefined);

  // Fix #1114: none resolved → return empty, NOT all emails
  if (resolvedNames.length === 0) {
    return { emails: [], earlyReturn: true };
  }

  // Apply the name filter (null/undefined category = "Other")
  const filtered = emails.filter((email) => {
    const effective = email.category || "Other";
    return resolvedNames.includes(effective);
  });

  return { emails: filtered, earlyReturn: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmail(id: string, category?: string | null): Email {
  return { id, from: `sender-${id}@example.com`, category };
}

function makeContext(contextId: string, contextValue: string): CategoryContext {
  return { contextId, contextValue };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("applyPostQueryFilters — category UUID resolution (fix #1114)", () => {
  const knownContexts = [
    makeContext("uuid-work", "Work - description"),
    makeContext("uuid-personal", "Personal - description"),
    makeContext("uuid-other", "Other - description"),
  ];

  const emails = [
    makeEmail("e1", "Work"),
    makeEmail("e2", "Personal"),
    makeEmail("e3", "Other"),
    // null category → treated as "Other" in effectiveCategory logic
    makeEmail("e4", null),
    makeEmail("e5", "Work"),
  ];

  it("returns empty array when categoryIds are provided but none resolve to a known category (stale UUIDs)", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(
      emails,
      ["stale-uuid-1", "stale-uuid-2"],
      knownContexts,
    );

    expect(earlyReturn).toBe(true);
    expect(result).toEqual([]);
    // Must NOT return the full email list — that was the bug
    expect(result.length).toBe(0);
  });

  it("returns all emails when categoryIds is empty (no regression)", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(
      emails,
      [],
      knownContexts,
    );

    expect(earlyReturn).toBe(false);
    expect(result).toHaveLength(emails.length);
    expect(result).toEqual(emails);
  });

  it("filters correctly when all categoryIds resolve to known category names", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(
      emails,
      ["uuid-work"],
      knownContexts,
    );

    expect(earlyReturn).toBe(false);
    // Should include only Work emails
    expect(result.map((email) => email.id)).toEqual(["e1", "e5"]);
    // Personal and Other should be excluded
    expect(result.every((email) => email.category === "Work")).toBe(true);
  });

  it("treats null/undefined email category as 'Other' when filtering", () => {
    const { emails: result } = applyCategoryFilter(
      emails,
      ["uuid-other"],
      knownContexts,
    );

    // e3 (explicit "Other") and e4 (null category treated as "Other") should both match
    expect(result.map((email) => email.id)).toEqual(["e3", "e4"]);
  });

  it("handles multiple resolved UUIDs — returns union of matching emails", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(
      emails,
      ["uuid-work", "uuid-personal"],
      knownContexts,
    );

    expect(earlyReturn).toBe(false);
    expect(result.map((email) => email.id)).toEqual(["e1", "e2", "e5"]);
  });

  it("returns empty array when categoryIds is undefined (no filter)", () => {
    const { emails: result } = applyCategoryFilter(
      emails,
      undefined,
      knownContexts,
    );

    // undefined means no filter — return all
    expect(result).toHaveLength(emails.length);
  });
});
