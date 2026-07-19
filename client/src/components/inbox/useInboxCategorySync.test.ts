/**
 * Unit tests for the category-order recomputation logic in useInboxCategorySync.
 *
 * Issue #1776: Categories were permanently stuck in their initial load order because
 * the sync effect only *appended* new server keys to the stable list, never re-sorting
 * existing ones. This meant a low-priority category (e.g. Newsletters, max -1) could
 * remain above a high-priority one (e.g. Payments, max 70) forever.
 *
 * The fix: when summaryCategories arrives from the server (already sorted by max
 * priority descending), adopt the server's ordering as the new stable order, preserving
 * any client-only keys at the end.
 *
 * Because the reordering runs inside a useEffect, we mirror the pure computation in
 * this test file rather than rendering the hook (which has many context dependencies).
 */

/**
 * Mirrors the reordering logic added to useInboxCategorySync.ts.
 * Returns the new ordered list if the order changed, or null if no update is needed.
 */
function computeReorderedCategoryKeys(
  summaryKeys: string[],
  stableCategoryOrder: string[],
): string[] | null {
  if (stableCategoryOrder.length === 0) {
    return summaryKeys;
  }
  const serverKeySet = new Set(summaryKeys);
  const clientOnlyKeys = stableCategoryOrder.filter(key => !serverKeySet.has(key));
  const reorderedKeys = [...summaryKeys, ...clientOnlyKeys];
  const orderChanged =
    reorderedKeys.length !== stableCategoryOrder.length ||
    reorderedKeys.some((key, idx) => key !== stableCategoryOrder[idx]);
  return orderChanged ? reorderedKeys : null;
}

describe('useInboxCategorySync — category order recomputation (#1776)', () => {
  describe('first load (stableCategoryOrder is empty)', () => {
    it('returns the server keys as-is', () => {
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];
      const result = computeReorderedCategoryKeys(summaryKeys, []);
      expect(result).toEqual(['payments-uuid', 'newsletters-uuid']);
    });

    it('returns a single key', () => {
      expect(computeReorderedCategoryKeys(['uuid-a'], [])).toEqual(['uuid-a']);
    });
  });

  describe('subsequent loads — re-sorting existing stable order', () => {
    it('re-sorts when server sends a different priority ordering (core fix #1776)', () => {
      // Stable order from initial load had Newsletters first (wrong)
      const stableCategoryOrder = ['newsletters-uuid', 'payments-uuid'];
      // Server now sends Payments first (correct priority sort: max 70 > max -1)
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      expect(result).toEqual(['payments-uuid', 'newsletters-uuid']);
    });

    it('returns null when the order already matches — no unnecessary re-render', () => {
      const stableCategoryOrder = ['payments-uuid', 'newsletters-uuid'];
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      expect(result).toBeNull();
    });

    it('appends a brand-new server category at the correct priority position', () => {
      const stableCategoryOrder = ['newsletters-uuid'];
      // Server now reports an additional category
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      expect(result).toEqual(['payments-uuid', 'newsletters-uuid']);
    });

    it('preserves client-only keys at the end', () => {
      // 'client-only-key' exists locally but the server summary does not include it yet
      const stableCategoryOrder = ['payments-uuid', 'newsletters-uuid', 'client-only-key'];
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      // Order is already correct for server keys, client-only key stays at end
      expect(result).toBeNull(); // no change — client-only key is already at the end
    });

    it('preserves client-only keys at the end when server order changes', () => {
      const stableCategoryOrder = ['newsletters-uuid', 'payments-uuid', 'client-only-key'];
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      expect(result).toEqual(['payments-uuid', 'newsletters-uuid', 'client-only-key']);
    });

    it('moves a removed category to the end (treated as client-only)', () => {
      // 'old-category-uuid' is no longer in the server summary (e.g. all emails archived)
      // but is still in the stable order from a previous load.
      // When the server's order already matches [payments, newsletters] AND old comes last,
      // no update is needed — the key stays at end and buildDisplayCategories filters it
      // out by count=0 anyway.
      const stableCategoryOrder = ['payments-uuid', 'newsletters-uuid', 'old-category-uuid'];
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      // Server order already matches the stable order prefix; 'old-category-uuid' is
      // treated as client-only and stays at the end → no change needed.
      expect(result).toBeNull();
    });

    it('moves a removed category to the end when server order also changes', () => {
      // Newsletters was first, payments was second, old-category is gone from server
      const stableCategoryOrder = ['old-category-uuid', 'newsletters-uuid', 'payments-uuid'];
      const summaryKeys = ['payments-uuid', 'newsletters-uuid'];

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      // Server says payments is now higher priority; old-category becomes client-only at end
      expect(result).toEqual(['payments-uuid', 'newsletters-uuid', 'old-category-uuid']);
    });

    it('handles a larger reorder with 4 categories', () => {
      const stableCategoryOrder = ['d', 'c', 'b', 'a'];
      const summaryKeys = ['a', 'b', 'c', 'd']; // server says highest priority is 'a'

      const result = computeReorderedCategoryKeys(summaryKeys, stableCategoryOrder);
      expect(result).toEqual(['a', 'b', 'c', 'd']);
    });

    it('returns null for identical single-item lists', () => {
      expect(computeReorderedCategoryKeys(['uuid-a'], ['uuid-a'])).toBeNull();
    });
  });
});
