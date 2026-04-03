/**
 * EMAIL_CATEGORY context rows store `contextValue` as "Name - optional description".
 * Deterministic rules and the category picker use the display name (first segment).
 */
export function getEmailCategoryDisplayNameFromContextValue(contextValue: string): string {
  const trimmed = contextValue.trim();
  if (!trimmed) {
    return '';
  }
  const dashSeparator = ' - ';
  const idx = trimmed.indexOf(dashSeparator);
  return (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
}
