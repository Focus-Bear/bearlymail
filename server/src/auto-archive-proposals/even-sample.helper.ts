/**
 * Up to `limit` items spread evenly across `items`, keeping their order. Used
 * to sample a sender's mail across the whole look-back window instead of only
 * its most recent messages.
 */
export function sampleEvenly<Item>(
  items: readonly Item[],
  limit: number,
): Item[] {
  if (items.length <= limit) return [...items];
  if (limit <= 0) return [];
  const step = items.length / limit;
  return Array.from(
    { length: limit },
    (_, slot) => items[Math.floor(slot * step)],
  );
}
