/**
 * Parses an ISO instant a client resolved from a free-text duration in the
 * user's own timezone (the API runs in UTC, so it cannot resolve "tomorrow"
 * itself). Returns null unless it is a valid time still in the future, so a
 * missing, garbled or stale value falls back to server-side parsing.
 */
export function parseFutureInstant(value: unknown, now: Date): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return instant.getTime() > now.getTime() ? instant : null;
}
