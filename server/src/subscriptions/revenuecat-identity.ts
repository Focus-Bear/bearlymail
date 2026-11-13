import { isUUID } from "class-validator";

/** The identity fields RevenueCat includes on every webhook event. */
export interface RevenueCatEventIdentity {
  app_user_id: string;
  original_app_user_id?: unknown;
  aliases?: unknown;
}

/** Upper bound on alias lookups per event, so a large alias list can't fan out. */
const MAX_IDENTITY_CANDIDATES = 10;

/**
 * Returns the BearlyMail user ids a RevenueCat event may belong to.
 *
 * Our clients identify to RevenueCat with the BearlyMail `users.id`, so the
 * owning user is whichever of the event's `app_user_id`, `original_app_user_id`
 * or `aliases` is a user UUID. Anonymous ids (`$RCAnonymousID:...`) and any
 * other non-UUID ids are dropped; ordering puts `app_user_id` first.
 */
export function getRevenueCatUserIdCandidates(
  event: RevenueCatEventIdentity,
): string[] {
  const aliases = Array.isArray(event.aliases) ? event.aliases : [];
  const ids = [event.app_user_id, event.original_app_user_id, ...aliases];
  const unique = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && isUUID(id)) unique.add(id);
  }
  return [...unique].slice(0, MAX_IDENTITY_CANDIDATES);
}
