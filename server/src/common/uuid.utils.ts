const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when `id` is a valid UUID v1-v5 string.
 *
 * Used to guard database lookups that require a UUID primary key, preventing
 * PostgreSQL cast errors when callers pass non-UUID identifiers (e.g. Gmail
 * hex thread IDs such as "19d03cdabc72da73").
 */
export function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}
