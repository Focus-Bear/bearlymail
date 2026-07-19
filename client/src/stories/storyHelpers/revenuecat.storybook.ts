/**
 * Storybook-only stand-in for `config/revenuecat` (aliased in .storybook/main.ts).
 *
 * The real module reads import.meta.env.VITE_REVENUECAT_API_KEY, which Vite
 * inlines at build time, so built Storybook can't toggle it at runtime. Stories
 * set `globalThis.__STORYBOOK_REVENUECAT_KEY__` instead (see PlanPickerModalDemo).
 */
export function getRevenueCatApiKey(): string | null {
  const key = (globalThis as Record<string, unknown>).__STORYBOOK_REVENUECAT_KEY__;
  if (typeof key === 'string' && key.trim() !== '') {
    return key.trim();
  }
  return null;
}
