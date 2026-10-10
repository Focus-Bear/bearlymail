/**
 * Helpers for the notification-subtype conditions a composite rule can carry.
 *
 * A v3 spec may pin ONE subtype (`notificationSubtype`, the original field) or
 * a SET (`notificationSubtypeAny`, OR within). Both are read through
 * {@link notificationSubtypesOf} so every consumer — matching, specificity,
 * dedup, gating — sees one canonical list and never diverges on which field a
 * persisted rule happens to use.
 */
import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import {
  NOTIFICATION_SUBTYPE_SEPARATOR,
  notificationSubtypeDepth,
  notificationSubtypeMatchesAny,
} from "../utils/notification-subtype.util";

/** Platform namespace prefix of every GitHub subtype (`github:pr:…`). */
const GITHUB_SUBTYPE_PREFIX = `github${NOTIFICATION_SUBTYPE_SEPARATOR}`;

/** Trims, drops empties, and de-duplicates (case-insensitive) a subtype list. */
export function cleanNotificationSubtypes(
  subtypes: ReadonlyArray<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of subtypes) {
    const subtype = raw?.trim();
    if (!subtype) continue;
    const key = subtype.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(subtype);
  }
  return cleaned;
}

/** Every subtype the spec is pinned to (single field ∪ set); empty when unpinned. */
export function notificationSubtypesOf(
  spec: CompositeCategoryRuleSpec,
): string[] {
  if (spec.v !== 3) {
    return [];
  }
  return cleanNotificationSubtypes([
    spec.notificationSubtype,
    ...(spec.notificationSubtypeAny ?? []),
  ]);
}

/** True when the spec is pinned to at least one notification sub-stream. */
export function specHasNotificationSubtype(
  spec: CompositeCategoryRuleSpec,
): boolean {
  return notificationSubtypesOf(spec).length > 0;
}

/** True when the spec is pinned to at least one GitHub sub-stream. */
export function specHasGithubNotificationSubtype(
  spec: CompositeCategoryRuleSpec,
): boolean {
  return notificationSubtypesOf(spec).some((subtype) =>
    subtype.toLowerCase().startsWith(GITHUB_SUBTYPE_PREFIX),
  );
}

/** True when `subtype` is a GitHub sub-stream key (`github:…`). */
export function isGithubNotificationSubtype(
  subtype: string | undefined | null,
): boolean {
  return (subtype ?? "").trim().toLowerCase().startsWith(GITHUB_SUBTYPE_PREFIX);
}

/**
 * Whether an email's resolved subtype satisfies the spec's subtype condition.
 * An unpinned spec is always satisfied; a pinned one needs the email subtype to
 * equal or refine any pinned member (see `notificationSubtypeMatches`).
 */
export function specMatchesNotificationSubtype(
  spec: CompositeCategoryRuleSpec,
  emailSubtype: string | undefined | null,
): boolean {
  const pinned = notificationSubtypesOf(spec);
  return (
    pinned.length === 0 || notificationSubtypeMatchesAny(pinned, emailSubtype)
  );
}

/**
 * Specificity depth of the spec's subtype pin: the SHALLOWEST pinned member's
 * segment count (a set is only as narrow as its broadest member). 0 when
 * unpinned. A rule pinned to `github:pr:merged:human` (4) beats a legacy
 * `github:pr` (2) rule for the same email.
 */
export function notificationSubtypeDepthOf(
  spec: CompositeCategoryRuleSpec,
): number {
  const depths = notificationSubtypesOf(spec).map(notificationSubtypeDepth);
  return depths.length === 0 ? 0 : Math.min(...depths);
}

/** Case-insensitive set equality of two specs' pinned subtypes. */
export function sameNotificationSubtypes(
  first: CompositeCategoryRuleSpec,
  second: CompositeCategoryRuleSpec,
): boolean {
  const key = (spec: CompositeCategoryRuleSpec): string =>
    notificationSubtypesOf(spec)
      .map((subtype) => subtype.toLowerCase())
      .sort()
      .join("");
  return key(first) === key(second);
}

/**
 * The canonical v3 field(s) for a pinned subtype list: a single subtype is
 * stored in `notificationSubtype` (so existing readers keep working), two or
 * more in `notificationSubtypeAny`. Empty when there is nothing to pin.
 */
export function notificationSubtypeFields(
  subtypes: ReadonlyArray<string | undefined | null>,
): Pick<
  CompositeCategoryRuleSpecV3,
  "notificationSubtype" | "notificationSubtypeAny"
> {
  const cleaned = cleanNotificationSubtypes(subtypes);
  if (cleaned.length === 0) {
    return {};
  }
  if (cleaned.length === 1) {
    return { notificationSubtype: cleaned[0] };
  }
  return { notificationSubtypeAny: cleaned };
}
