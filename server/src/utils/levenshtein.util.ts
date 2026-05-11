const LEVENSHTEIN_FUZZY_RATIO = 0.2;
const LEVENSHTEIN_MIN_THRESHOLD = 3;

/**
 * Computes the Levenshtein edit distance between two strings.
 * Uses dynamic programming (O(n*m) time, O(n*m) space).
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const rows = str2.length + 1;
  const cols = str1.length + 1;

  const matrix: number[][] = Array.from({ length: rows }, (_, rowIdx) =>
    Array.from({ length: cols }, (__, colIdx) => {
      if (rowIdx === 0) return colIdx;
      if (colIdx === 0) return rowIdx;
      return 0;
    }),
  );

  for (let rowIdx = 1; rowIdx < rows; rowIdx++) {
    for (let colIdx = 1; colIdx < cols; colIdx++) {
      if (str2[rowIdx - 1] === str1[colIdx - 1]) {
        matrix[rowIdx][colIdx] = matrix[rowIdx - 1][colIdx - 1];
      } else {
        matrix[rowIdx][colIdx] =
          1 +
          Math.min(
            matrix[rowIdx - 1][colIdx - 1],
            matrix[rowIdx][colIdx - 1],
            matrix[rowIdx - 1][colIdx],
          );
      }
    }
  }

  return matrix[rows - 1][cols - 1];
}

/**
 * Returns true when two category name strings are similar enough to be
 * considered near-duplicates — i.e., Levenshtein distance ≤
 * max(LEVENSHTEIN_MIN_THRESHOLD, LEVENSHTEIN_FUZZY_RATIO * longer string length).
 *
 * Examples that qualify:
 *   "CI/CD Alerts"  vs "CI/CD Alert"       → distance 1  ✓
 *   "Newsletters"   vs "Newslters"          → distance 2  ✓
 *   "Customer Support" vs "Custmer Support" → distance 2  ✓
 */
export function isSimilarCategoryName(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const maxLen = Math.max(nameA.length, nameB.length);
  const threshold = Math.max(
    LEVENSHTEIN_MIN_THRESHOLD,
    Math.floor(maxLen * LEVENSHTEIN_FUZZY_RATIO),
  );
  return levenshteinDistance(nameA, nameB) <= threshold;
}
