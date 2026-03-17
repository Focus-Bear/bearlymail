/**
 * Pure helper functions extracted from AutoResponderEmailPreview.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 *
 * NOTE: formatDate uses toLocaleDateString which is locale-sensitive.
 * Tests should check structure rather than exact locale output.
 */

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
