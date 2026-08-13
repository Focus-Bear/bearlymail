/**
 * Maximum number of real (EMAIL_CATEGORY) categories a user may accumulate via
 * bootstrap auto-promotion. While a user has fewer than this many real
 * categories, a genuinely-new (deduped) proto-category suggestion is promoted
 * to a real category immediately — effective promotion threshold of 1 — so a
 * brand-new signup with an empty taxonomy gets a working set of categories
 * right away instead of everything landing in "Other". Once the user reaches
 * this many real categories, bootstrap stops and the normal
 * {@link ProtoCategory.PROMOTION_THRESHOLD}-email threshold applies.
 */
export const MAX_BOOTSTRAP_CATEGORIES = 30;
