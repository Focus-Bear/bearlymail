import { CATEGORY_PAGE_SIZE, INBOX_FETCH_LIMIT } from 'constants/numbers';

/** What one background refresh tick should do with the categories loaded so far. */
export interface CategoryRefreshPlan {
  /** Open, loaded categories with no fetch already in flight: refetched this tick. */
  refreshKeys: string[];
  /** Loaded but collapsed categories: not refetched, only marked stale so the next expand refetches them. */
  staleKeys: string[];
}

/**
 * Split the loaded categories into the ones a refresh tick should refetch (visible) and the
 * ones it should only invalidate (collapsed). Categories with a fetch already in flight
 * (an expand racing the poll) are left alone so the same category is never fetched twice
 * concurrently.
 */
export function planCategoryRefresh({
  loadedKeys,
  loadingKeys,
  expandedKeys,
}: {
  loadedKeys: string[];
  loadingKeys: string[];
  expandedKeys: string[];
}): CategoryRefreshPlan {
  const loading = new Set(loadingKeys);
  const expanded = new Set(expandedKeys);
  const idleLoadedKeys = loadedKeys.filter(key => !loading.has(key));
  return {
    refreshKeys: idleLoadedKeys.filter(key => expanded.has(key)),
    staleKeys: idleLoadedKeys.filter(key => !expanded.has(key)),
  };
}

/** Split keys into groups of at most `size` (the batch endpoint's per-request category cap). */
export function chunkKeys(keys: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < keys.length; start += size) {
    chunks.push(keys.slice(start, start + size));
  }
  return chunks;
}

/**
 * Rows to request per category when refreshing `keys` in one batch: enough to cover the
 * longest category the user has paged into ("Show more"), rounded up to whole pages so a
 * refresh never truncates rows already on screen. Never below one page or above the
 * inbox-wide fetch cap.
 */
export function refreshLimitFor(keys: string[], loadedRowCounts: Map<string, number>): number {
  const mostRowsLoaded = Math.max(0, ...keys.map(key => loadedRowCounts.get(key) ?? 0));
  const pagesLoaded = Math.max(1, Math.ceil(mostRowsLoaded / CATEGORY_PAGE_SIZE));
  return Math.min(pagesLoaded * CATEGORY_PAGE_SIZE, INBOX_FETCH_LIMIT);
}
