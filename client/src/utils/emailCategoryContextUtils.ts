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

/**
 * Returns the description portion (after the first " - ") of an EMAIL_CATEGORY contextValue,
 * or null when no separator is present.
 */
export function getEmailCategoryDescriptionFromContextValue(contextValue: string): string | null {
  const trimmed = contextValue.trim();
  const dashSeparator = ' - ';
  const idx = trimmed.indexOf(dashSeparator);
  if (idx === -1) {
    return null;
  }
  const description = trimmed.slice(idx + dashSeparator.length).trim();
  return description || null;
}
