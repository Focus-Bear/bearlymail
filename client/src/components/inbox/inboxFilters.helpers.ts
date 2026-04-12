/**
 * Pure helper functions for InboxFilters component.
 * Extracted to enable unit testing of display-text business logic.
 */

/**
 * Returns the display text for a multi-select dropdown based on the current selection.
 *
 * @param selectedIds - Array of currently selected option ids.
 * @param options - All available options with their ids and labels.
 * @param placeholder - Text shown when nothing is selected.
 * @returns
 *   - `placeholder` when nothing is selected
 *   - The matching option label when exactly one id is selected
 *   - `"N selected"` when two or more ids are selected
 */
export function getMultiSelectDisplayText(
  selectedIds: string[],
  options: Array<{ id: string; label: string }>,
  placeholder: string
): string {
  if (selectedIds.length === 0) {
    return placeholder;
  }
  if (selectedIds.length === 1) {
    return options.find(opt => opt.id === selectedIds[0])?.label ?? placeholder;
  }
  return `${selectedIds.length} selected`;
}
