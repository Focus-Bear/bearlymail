/**
 * Pure helper functions for InboxFilters component.
 * Extracted to enable unit testing of display-text business logic.
 */

/** A filter button names its choices outright up to this many; beyond it, it counts them. */
const MAX_NAMED_SELECTIONS = 2;

/**
 * The words a multi-select filter button shows for the current selection.
 *
 * @param selectedIds - Currently selected option ids.
 * @param options - All available options with their ids and labels.
 * @param allText - Shown when nothing is selected (nothing selected means no filtering).
 * @param countText - Builds the "N selected" wording for a selection too long to name.
 * @returns `allText`, the selected labels joined by commas (one or two), or `countText(n)` —
 *   also used when a selected id is no longer among the options and so cannot be named.
 */
export function getSelectionSummary(
  selectedIds: string[],
  options: Array<{ id: string; label: string }>,
  allText: string,
  countText: (count: number) => string
): string {
  if (selectedIds.length === 0) {
    return allText;
  }
  const labels = selectedIds.flatMap(id => options.find(opt => opt.id === id)?.label ?? []);
  if (labels.length === selectedIds.length && labels.length <= MAX_NAMED_SELECTIONS) {
    return labels.join(', ');
  }
  return countText(selectedIds.length);
}
