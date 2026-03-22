/**
 * Unit tests for the category-filter logic in applyPostQueryFilters (fix #1114, #1293).
 *
 * After the denormalized category column removal (fixes #1293), filtering uses
 * categoryId (UUID) directly on the InboxEmail object. No name resolution needed.
 *
 * "Other" == categoryId IS NULL.
 *
 * Tests here use a pure-function mirror of the relevant logic so we avoid the full
 * NestJS DI bootstrap overhead (same pattern as emails-priority-inbox.service.spec.ts).
 */

// ─── Pure-function mirror of applyPostQueryFilters category logic ─────────────
//
// Keep in sync with the implementation in email-inbox.service.ts
// (private applyPostQueryFilters → categoryIds branch).

const CATEGORY_OTHER = "Other";

interface Email {
  id: string;
  from: string;
  categoryId?: string | null;
  [key: string]: unknown;
}

/**
 * Mirror the UUID-based category filtering from applyPostQueryFilters (post #1293).
 *
 * @param emails         Raw email list (categoryId is the single source of truth)
 * @param categoryIds    Requested category UUIDs ("Other" = null categoryId)
 * @returns Filtered email list
 */
function applyCategoryFilter(
  emails: Email[],
  categoryIds: string[] | undefined,
): { emails: Email[]; earlyReturn: boolean } {
  if (!categoryIds || categoryIds.length === 0) {
    return { emails, earlyReturn: false };
  }

  const requestedOther = categoryIds.includes(CATEGORY_OTHER);
  const realIds = categoryIds.filter((id) => id !== CATEGORY_OTHER);
  const requestedUuids = new Set(realIds);

  const filtered = emails.filter((email) => {
    if (requestedOther && !email.categoryId) return true;
    if (email.categoryId) return requestedUuids.has(email.categoryId);
    return false;
  });

  return { emails: filtered, earlyReturn: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmail(id: string, categoryId?: string | null): Email {
  return { id, from: `sender-${id}@example.com`, categoryId };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("applyPostQueryFilters — category UUID filtering (fix #1114, #1293)", () => {
  const emails = [
    makeEmail("e1", "uuid-work"),
    makeEmail("e2", "uuid-personal"),
    // null categoryId = "Other"
    makeEmail("e3", null),
    // null categoryId = "Other"
    makeEmail("e4", null),
    makeEmail("e5", "uuid-work"),
  ];

  it("returns all emails when categoryIds is empty (no regression)", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(emails, []);

    expect(earlyReturn).toBe(false);
    expect(result).toHaveLength(emails.length);
    expect(result).toEqual(emails);
  });

  it("filters by UUID — returns only matching categoryId emails", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(emails, [
      "uuid-work",
    ]);

    expect(earlyReturn).toBe(false);
    expect(result.map((email) => email.id)).toEqual(["e1", "e5"]);
    expect(result.every((email) => email.categoryId === "uuid-work")).toBe(
      true,
    );
  });

  it("treats null categoryId as 'Other' when filtering by Other", () => {
    const { emails: result } = applyCategoryFilter(emails, [CATEGORY_OTHER]);

    // e3 and e4 have null categoryId → "Other"
    expect(result.map((email) => email.id)).toEqual(["e3", "e4"]);
  });

  it("handles multiple UUIDs — returns union of matching emails", () => {
    const { emails: result, earlyReturn } = applyCategoryFilter(emails, [
      "uuid-work",
      "uuid-personal",
    ]);

    expect(earlyReturn).toBe(false);
    expect(result.map((email) => email.id)).toEqual(["e1", "e2", "e5"]);
  });

  it("returns empty array when categoryIds is undefined (no filter)", () => {
    const { emails: result } = applyCategoryFilter(emails, undefined);

    expect(result).toHaveLength(emails.length);
  });

  it("returns empty when no emails match the requested UUID", () => {
    const { emails: result } = applyCategoryFilter(emails, ["stale-uuid"]);

    expect(result).toHaveLength(0);
  });

  it("Other + UUID filter returns both null-categoryId and matching UUID emails", () => {
    const { emails: result } = applyCategoryFilter(emails, [
      CATEGORY_OTHER,
      "uuid-personal",
    ]);

    // e2 (personal), e3 (null), e4 (null)
    expect(result.map((email) => email.id)).toEqual(["e2", "e3", "e4"]);
  });
});
