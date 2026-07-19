import { parseCategoryName } from "../utils/category-name.util";

/**
 * Unit tests for the category-filter logic in applyPostQueryFilters (fix #1114, #1293, #1337).
 *
 * After the denormalized category column removal (fixes #1293), filtering uses
 * categoryId (UUID) directly on the InboxEmail object. No name resolution needed.
 *
 * "Other" == categoryId IS NULL.
 * "uncategorized" is a client-side synonym for "Other" (fix #1337).
 *
 * Tests here use a pure-function mirror of the relevant logic so we avoid the full
 * NestJS DI bootstrap overhead (same pattern as emails-priority-inbox.service.spec.ts).
 */

// ─── Pure-function mirror of applyPostQueryFilters category logic ─────────────
//
// Keep in sync with the implementation in email-inbox.service.ts
// (private applyPostQueryFilters → categoryIds branch).

const CATEGORY_OTHER = "Other";
/** Client-side constant for the "uncategorized" bucket (fix #1337) */
const UNCATEGORIZED_CATEGORY_KEY = "uncategorized";

interface Email {
  id: string;
  from: string;
  categoryId?: string | null;
  [key: string]: unknown;
}

/**
 * Mirror the UUID-based category filtering from applyPostQueryFilters (post #1293).
 * Accepts both "Other" and "uncategorized" as synonyms for null categoryId (fix #1337).
 *
 * @param emails         Raw email list (categoryId is the single source of truth)
 * @param categoryIds    Requested category UUIDs ("Other"/"uncategorized" = null categoryId)
 * @returns Filtered email list
 */
function applyCategoryFilter(
  emails: Email[],
  categoryIds: string[] | undefined,
): { emails: Email[]; earlyReturn: boolean } {
  if (!categoryIds || categoryIds.length === 0) {
    return { emails, earlyReturn: false };
  }

  // Accept both "Other" and "uncategorized" as synonyms for null-categoryId emails
  const requestedOther =
    categoryIds.includes(CATEGORY_OTHER) ||
    categoryIds.includes(UNCATEGORIZED_CATEGORY_KEY);
  const realIds = categoryIds.filter(
    (id) => id !== CATEGORY_OTHER && id !== UNCATEGORIZED_CATEGORY_KEY,
  );
  const requestedUuids = new Set(realIds);

  const filtered = emails.filter((email) => {
    if (requestedOther && !email.categoryId) return true;
    if (email.categoryId) return requestedUuids.has(email.categoryId);
    return false;
  });

  return { emails: filtered, earlyReturn: false };
}

// ─── Pure-function mirror of countRowsByCategory decryption logic ─────────────
//
// Keep in sync with the decryption path in email-inbox.service.ts
// (private countRowsByCategory / getInboxSummary).

/**
 * Mirror of the EncryptionHelper.decrypt + split logic used in countRowsByCategory.
 * In production this uses EncryptionHelper.decrypt(); here we stub the decryption
 * so the test focuses on the mapping logic only.
 *
 * @param decryptFn  Substitutable decrypt function (stub in tests, real impl in prod)
 * @param rawRows    Raw query result rows with encrypted categoryName
 * @param OTHER      The display name for null-category emails
 */
function buildCategoryCountMap(
  decryptFn: (raw: string | null | undefined) => string | null,
  rawRows: Array<{ categoryName: string | null; count: number }>,
  OTHER = "Other",
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rawRows) {
    const decrypted = decryptFn(row.categoryName);
    const name = decrypted ? parseCategoryName(decrypted) : OTHER;
    map.set(name, (map.get(name) ?? 0) + row.count);
  }
  return map;
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

  // ─── Fix #1337: "uncategorized" synonym ────────────────────────────────────

  it('"uncategorized" synonym returns null-categoryId emails (same as "Other")', () => {
    const { emails: result } = applyCategoryFilter(emails, [
      UNCATEGORIZED_CATEGORY_KEY,
    ]);

    // e3 and e4 have null categoryId → treated as "uncategorized"
    expect(result.map((email) => email.id)).toEqual(["e3", "e4"]);
  });

  it('"uncategorized" + UUID returns both null-categoryId and matching UUID emails', () => {
    const { emails: result } = applyCategoryFilter(emails, [
      UNCATEGORIZED_CATEGORY_KEY,
      "uuid-work",
    ]);

    // e1 (work), e3 (null), e4 (null), e5 (work)
    expect(result.map((email) => email.id)).toEqual(["e1", "e3", "e4", "e5"]);
  });

  it('"uncategorized" and "Other" together are de-duped (no duplicate null emails)', () => {
    const { emails: result } = applyCategoryFilter(emails, [
      CATEGORY_OTHER,
      UNCATEGORIZED_CATEGORY_KEY,
    ]);

    // Same null-categoryId emails, not doubled
    expect(result.map((email) => email.id)).toEqual(["e3", "e4"]);
  });
});

// ─── Tests for countRowsByCategory decryption ─────────────────────────────────

describe("countRowsByCategory — ciphertext→decrypted in summary path (fix #1337)", () => {
  it("maps a decrypted categoryName to a display name before the dash", () => {
    const stubDecrypt = (raw: string | null | undefined) =>
      raw === "enc:newsletters"
        ? "Newsletters - Weekly digests"
        : (raw ?? null);

    const rows = [{ categoryName: "enc:newsletters", count: 5 }];
    const map = buildCategoryCountMap(stubDecrypt, rows);

    expect(map.get("Newsletters")).toBe(5);
    expect(map.has("enc:newsletters")).toBe(false);
  });

  it("maps null categoryName to Other", () => {
    const stubDecrypt = (_raw: string | null | undefined) => null;

    const rows = [{ categoryName: null, count: 3 }];
    const map = buildCategoryCountMap(stubDecrypt, rows);

    expect(map.get("Other")).toBe(3);
  });

  it("accumulates counts for the same category across multiple rows", () => {
    const stubDecrypt = (raw: string | null | undefined) =>
      raw === "enc:work" ? "Work - Professional" : (raw ?? null);

    const rows = [
      { categoryName: "enc:work", count: 4 },
      { categoryName: "enc:work", count: 6 },
    ];
    const map = buildCategoryCountMap(stubDecrypt, rows);

    expect(map.get("Work")).toBe(10);
  });

  it("passes through plaintext categoryName unchanged (backward-compat)", () => {
    // EncryptionHelper.decrypt returns the string unchanged when it's not ciphertext
    const stubDecrypt = (raw: string | null | undefined) => raw ?? null;

    const rows = [{ categoryName: "Newsletters - Weekly digests", count: 2 }];
    const map = buildCategoryCountMap(stubDecrypt, rows);

    expect(map.get("Newsletters")).toBe(2);
  });
});
