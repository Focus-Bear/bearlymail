const MIN_CONCURRENCY = 1;

/**
 * Runs `worker` over `items` with at most `limit` calls in flight and resolves
 * to the results in input order. A free slot picks up the next item as soon as
 * any call settles, so one slow item never holds back the rest.
 *
 * A rejection rejects the returned promise, so callers that need per-item
 * error isolation must catch inside `worker`.
 */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const runLane = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  };
  // A NaN limit (e.g. an unparsable env var) would otherwise spawn zero lanes
  // and silently skip every item.
  const safeLimit = Number.isNaN(limit)
    ? MIN_CONCURRENCY
    : Math.max(MIN_CONCURRENCY, Math.floor(limit));
  const laneCount = Math.min(items.length, safeLimit);
  await Promise.all(Array.from({ length: laneCount }, runLane));
  return results;
}
