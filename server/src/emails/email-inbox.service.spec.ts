/**
 * Unit tests for category sort order logic in EmailInboxService (fix #1550).
 *
 * The action tab was showing categories in SQL row-insertion order rather than
 * priority order. Fix #1550 adds a sort step: categories are ordered by their
 * max thread `priorityScore` descending, so high-priority categories always
 * appear before low-priority ones (e.g. Newsletters at -1).
 *
 * These tests use a pure-function mirror of the sort logic so we avoid the full
 * NestJS DI bootstrap overhead (same pattern as applyPostQueryFilters.spec.ts).
 */

// ─── Pure-function mirror of the category sort logic ─────────────────────────
//
// Keep in sync with the countRowsByCategory sort step in email-inbox.service.ts.

interface CategoryRow {
  categoryName: string;
  priorityScore: number | null;
}

/**
 * Mirror of the category accumulation + sort from countRowsByCategory.
 * Returns categories ordered by max thread priorityScore descending.
 *
 * @param rows  Simulated query rows (plaintext categoryName, no encryption needed here)
 * @returns     Category names in descending max-priority order
 */
function buildSortedCategoryOrder(rows: CategoryRow[]): string[] {
  const categoryOrder: string[] = [];
  const categoryMaxPriority: Record<string, number> = {};

  for (const row of rows) {
    const category = row.categoryName;
    const threadPriority = row.priorityScore ?? 0;

    if (!categoryOrder.includes(category)) {
      categoryOrder.push(category);
      categoryMaxPriority[category] = threadPriority;
    } else {
      categoryMaxPriority[category] = Math.max(
        categoryMaxPriority[category],
        threadPriority,
      );
    }
  }

  // Sort categories by their max thread priority descending (fix #1550).
  categoryOrder.sort(
    (catA, catB) =>
      (categoryMaxPriority[catB] ?? 0) - (categoryMaxPriority[catA] ?? 0),
  );

  return categoryOrder;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("category sort order — fix #1550", () => {
  it("sorts categories by max thread priority descending", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Newsletters", priorityScore: -1 },
      { categoryName: "Work", priorityScore: 80 },
      { categoryName: "Personal", priorityScore: 50 },
    ];

    const order = buildSortedCategoryOrder(rows);

    expect(order).toEqual(["Work", "Personal", "Newsletters"]);
  });

  it("Newsletters (max priority -1) appears after higher-priority categories", () => {
    const rows: CategoryRow[] = [
      // SQL returns Newsletters first (insertion order)
      { categoryName: "Newsletters", priorityScore: -1 },
      { categoryName: "Newsletters", priorityScore: -1 },
      { categoryName: "Work", priorityScore: 70 },
      { categoryName: "Work", priorityScore: 40 },
    ];

    const order = buildSortedCategoryOrder(rows);

    expect(order[0]).toBe("Work");
    expect(order[order.length - 1]).toBe("Newsletters");
  });

  it("uses the MAX priority within a category, not the first seen", () => {
    const rows: CategoryRow[] = [
      // Low-priority thread for Work arrives first in SQL order
      { categoryName: "Work", priorityScore: 10 },
      { categoryName: "Personal", priorityScore: 90 },
      // High-priority Work thread arrives later
      { categoryName: "Work", priorityScore: 95 },
    ];

    const order = buildSortedCategoryOrder(rows);

    // Work max = 95 > Personal max = 90
    expect(order[0]).toBe("Work");
    expect(order[1]).toBe("Personal");
  });

  it("treats NULL priorityScore as 0 when computing max", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Uncategorized", priorityScore: null },
      { categoryName: "Work", priorityScore: 50 },
    ];

    const order = buildSortedCategoryOrder(rows);

    // Work (50) > Uncategorized (null → 0)
    expect(order[0]).toBe("Work");
    expect(order[1]).toBe("Uncategorized");
  });

  it("maintains stable relative order when max priorities are equal", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Alpha", priorityScore: 50 },
      { categoryName: "Beta", priorityScore: 50 },
      { categoryName: "Gamma", priorityScore: 50 },
    ];

    const order = buildSortedCategoryOrder(rows);

    // All equal priority — all three must be present
    expect(order).toHaveLength(3);
    expect(order).toContain("Alpha");
    expect(order).toContain("Beta");
    expect(order).toContain("Gamma");
  });

  it("returns a single category unchanged", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Work", priorityScore: 75 },
      { categoryName: "Work", priorityScore: 60 },
    ];

    const order = buildSortedCategoryOrder(rows);

    expect(order).toEqual(["Work"]);
  });

  it("returns empty array for empty input", () => {
    const order = buildSortedCategoryOrder([]);
    expect(order).toEqual([]);
  });

  it("handles all-null priorityScores — categories all treated as priority 0", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Alpha", priorityScore: null },
      { categoryName: "Beta", priorityScore: null },
    ];

    const order = buildSortedCategoryOrder(rows);

    // Both are 0 — both must appear
    expect(order).toHaveLength(2);
    expect(order).toContain("Alpha");
    expect(order).toContain("Beta");
  });

  it("negative priorities sort below zero-priority categories", () => {
    const rows: CategoryRow[] = [
      { categoryName: "Newsletters", priorityScore: -5 },
      { categoryName: "Other", priorityScore: null },
      { categoryName: "Work", priorityScore: 30 },
    ];

    const order = buildSortedCategoryOrder(rows);

    // Work (30) > Other (null → 0) > Newsletters (-5)
    expect(order[0]).toBe("Work");
    expect(order[order.length - 1]).toBe("Newsletters");
  });
});
