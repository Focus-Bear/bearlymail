/**
 * Opens the Settings page in a NEW browser tab, deep-linked to the
 * email-categories section. When a category display name is supplied, the
 * Settings page scrolls straight to and highlights that category's details
 * (see ContextSectionsList's `?category=` handling).
 *
 * Used by the per-category ⚙️ settings button in the inbox category headers.
 */
/**
 * The Settings deep-link URL for a category's details (email-categories section).
 * Used as the `href` of the category-name link in the inbox category headers.
 */
export function categorySettingsUrl(categoryName?: string): string {
  return categoryName
    ? `/settings?category=${encodeURIComponent(categoryName)}#email-categories`
    : '/settings#email-categories';
}

export function openCategorySettings(categoryName?: string): void {
  window.open(categorySettingsUrl(categoryName), '_blank', 'noopener,noreferrer');
}
