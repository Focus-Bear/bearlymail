import { ROUTE_SETTINGS } from 'constants/strings';

/**
 * Settings section ids that other screens deep-link to. The section renders
 * `id={SETTINGS_ANCHORS.X}` and the link uses `settingsAnchorPath(SETTINGS_ANCHORS.X)`,
 * so a renamed section can't silently strand its links.
 */
export const SETTINGS_ANCHORS = {
  CONTEXT: 'context',
  EMAIL_BATCHING: 'email-batching',
  EMAIL_CATEGORIES: 'email-categories',
  CATEGORY_FAMILIES: 'category-families',
  CATEGORY_RULES: 'category-rules',
  CLAUDE_ACCESS: 'connect-claude',
  CONNECTED_APPS: 'connected-apps',
  FOCUS_BEAR: 'focus-bear',
  WORKFLOWS: 'workflows',
} as const;

/** Query param that hands scrolling to the email-categories list (it scrolls to that category's row). */
export const SETTINGS_CATEGORY_QUERY_PARAM = 'category' as const;

/** Query param that makes Settings run the onboarding context analysis on arrival. */
export const SETTINGS_AUTO_ANALYZE_PARAM = 'autoAnalyze' as const;

/** `/settings#<anchor>`, with an optional query string (no leading `?`). */
export function settingsAnchorPath(anchor: string, query?: string): string {
  return `${ROUTE_SETTINGS}${query ? `?${query}` : ''}#${anchor}`;
}
