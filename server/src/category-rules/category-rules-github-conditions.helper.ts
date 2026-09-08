/**
 * Helpers for the GitHub-metadata structural conditions a composite rule can
 * carry (`githubStateAny`, `githubProjectStatusAny`, `githubAuthorKind`,
 * `githubLabelsAny`). Every consumer — matching, specificity, dedup, the
 * persist/sanity gates, the LLM summaries — reads them through
 * {@link githubConditionsOf} so a persisted rule is interpreted one way.
 *
 * Semantics: each present condition is an AND with the rest of the rule; a
 * list is OR within. A condition can only be satisfied by an email whose
 * thread carries fetched metadata for the item — an email with no facts never
 * satisfies a pinned rule (mirrors the notification-subtype condition).
 */
import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  GITHUB_ACTOR_KINDS,
  GITHUB_ITEM_STATES,
  GithubActorKind,
  GithubItemState,
} from "../constants/github-notification.constants";
import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
  GithubProjectStatusCondition,
} from "../database/entities/category-rule.entity";
import type { GithubCategorySignals } from "../github/github-category-signals.helper";

export type GithubRuleConditions = Pick<
  CompositeCategoryRuleSpecV3,
  | "githubStateAny"
  | "githubProjectStatusAny"
  | "githubAuthorKind"
  | "githubLabelsAny"
>;

/** Separator between a project title and its status in the flat string form. */
export const GITHUB_PROJECT_STATUS_SCOPE_SEPARATOR = " / ";

const KNOWN_STATES = new Set<string>(Object.values(GITHUB_ITEM_STATES));
const KNOWN_ACTOR_KINDS = new Set<string>(Object.values(GITHUB_ACTOR_KINDS));

function normaliseKey(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeCaseInsensitive(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = normaliseKey(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Trims, validates against the vocab and de-duplicates a state list. */
export function cleanGithubStates(
  states: ReadonlyArray<string | null | undefined>,
): GithubItemState[] {
  return dedupeCaseInsensitive(
    states.map((state) => normaliseKey(state ?? "")),
  ).filter((state): state is GithubItemState => KNOWN_STATES.has(state));
}

/** Trims and de-duplicates (case-insensitive, per project scope) a status list. */
export function cleanGithubProjectStatuses(
  statuses: ReadonlyArray<Partial<GithubProjectStatusCondition> | null>,
): GithubProjectStatusCondition[] {
  const seen = new Set<string>();
  const out: GithubProjectStatusCondition[] = [];
  for (const raw of statuses) {
    const status = raw?.status?.trim() ?? "";
    const project = raw?.project?.trim() || undefined;
    if (!status) continue;
    const key = `${normaliseKey(project ?? "")}${normaliseKey(status)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(project ? { status, project } : { status });
  }
  return out;
}

/** Trims and de-duplicates a label list (case-insensitive). */
export function cleanGithubLabels(
  labels: ReadonlyArray<string | null | undefined>,
): string[] {
  return dedupeCaseInsensitive(labels.map((label) => label ?? ""));
}

/** The author-kind pin when it is in the vocab; undefined otherwise. */
export function cleanGithubAuthorKind(
  kind: string | null | undefined,
): GithubActorKind | undefined {
  const key = normaliseKey(kind ?? "");
  return KNOWN_ACTOR_KINDS.has(key) ? (key as GithubActorKind) : undefined;
}

/** The GitHub conditions carried by the spec (empty object for v1/v2 or none). */
export function githubConditionsOf(
  spec: CompositeCategoryRuleSpec,
): GithubRuleConditions {
  if (spec.v !== CATEGORY_RULE_COMPOSITE.SPEC_VERSION) {
    return {};
  }
  return {
    ...(spec.githubStateAny?.length && {
      githubStateAny: spec.githubStateAny,
    }),
    ...(spec.githubProjectStatusAny?.length && {
      githubProjectStatusAny: spec.githubProjectStatusAny,
    }),
    ...(spec.githubAuthorKind && { githubAuthorKind: spec.githubAuthorKind }),
    ...(spec.githubLabelsAny?.length && {
      githubLabelsAny: spec.githubLabelsAny,
    }),
  };
}

/** How many distinct GitHub conditions the spec pins (0–4). */
export function githubConditionCount(spec: CompositeCategoryRuleSpec): number {
  return Object.keys(githubConditionsOf(spec)).length;
}

/** True when the spec pins at least one GitHub-metadata condition. */
export function specHasGithubConditions(
  spec: CompositeCategoryRuleSpec,
): boolean {
  return githubConditionCount(spec) > 0;
}

/**
 * The canonical v3 fields for a set of cleaned conditions — only populated
 * fields are emitted so an unpinned spec carries no empty arrays.
 */
export function githubConditionFields(
  conditions: GithubRuleConditions,
): GithubRuleConditions {
  const states = cleanGithubStates(conditions.githubStateAny ?? []);
  const statuses = cleanGithubProjectStatuses(
    conditions.githubProjectStatusAny ?? [],
  );
  const labels = cleanGithubLabels(conditions.githubLabelsAny ?? []);
  const authorKind = cleanGithubAuthorKind(conditions.githubAuthorKind);
  return {
    ...(states.length > 0 && { githubStateAny: states }),
    ...(statuses.length > 0 && { githubProjectStatusAny: statuses }),
    ...(authorKind && { githubAuthorKind: authorKind }),
    ...(labels.length > 0 && { githubLabelsAny: labels }),
  };
}

function projectStatusSatisfied(
  condition: GithubProjectStatusCondition,
  facts: GithubCategorySignals,
): boolean {
  const wantedStatus = normaliseKey(condition.status);
  const wantedProject = condition.project
    ? normaliseKey(condition.project)
    : null;
  return facts.projectStatuses.some(
    (entry) =>
      normaliseKey(entry.status) === wantedStatus &&
      (wantedProject === null || normaliseKey(entry.project) === wantedProject),
  );
}

/**
 * Whether the email's GitHub facts satisfy every GitHub condition on the spec.
 * An unpinned spec is always satisfied; a pinned one needs facts.
 */
export function specMatchesGithubConditions(
  spec: CompositeCategoryRuleSpec,
  facts: GithubCategorySignals | null | undefined,
): boolean {
  const conditions = githubConditionsOf(spec);
  if (Object.keys(conditions).length === 0) {
    return true;
  }
  if (!facts) {
    return false;
  }
  if (
    conditions.githubStateAny &&
    !(facts.state && conditions.githubStateAny.includes(facts.state))
  ) {
    return false;
  }
  if (
    conditions.githubProjectStatusAny &&
    !conditions.githubProjectStatusAny.some((condition) =>
      projectStatusSatisfied(condition, facts),
    )
  ) {
    return false;
  }
  if (
    conditions.githubAuthorKind &&
    facts.authorKind !== conditions.githubAuthorKind
  ) {
    return false;
  }
  if (conditions.githubLabelsAny) {
    const labels = new Set(facts.labels.map(normaliseKey));
    if (
      !conditions.githubLabelsAny.some((label) =>
        labels.has(normaliseKey(label)),
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Flat, human-readable form of one project-status pin (`Board / QA passed`). */
export function formatGithubProjectStatusCondition(
  condition: GithubProjectStatusCondition,
): string {
  return condition.project
    ? `${condition.project}${GITHUB_PROJECT_STATUS_SCOPE_SEPARATOR}${condition.status}`
    : condition.status;
}

/**
 * Human-readable lines for the LLM-facing rule summaries and the sanity
 * reviewer, e.g. `state is one of: merged`, `board status is one of: QA passed`.
 */
export function describeGithubConditions(
  spec: CompositeCategoryRuleSpec,
): string[] {
  const conditions = githubConditionsOf(spec);
  const lines: string[] = [];
  if (conditions.githubStateAny) {
    lines.push(`state is one of: ${conditions.githubStateAny.join(", ")}`);
  }
  if (conditions.githubProjectStatusAny) {
    lines.push(
      `project board status is one of: ${conditions.githubProjectStatusAny
        .map(formatGithubProjectStatusCondition)
        .join(", ")}`,
    );
  }
  if (conditions.githubAuthorKind) {
    lines.push(`PR/issue author is a ${conditions.githubAuthorKind}`);
  }
  if (conditions.githubLabelsAny) {
    lines.push(
      `labels include one of: ${conditions.githubLabelsAny.join(", ")}`,
    );
  }
  return lines;
}

/** Case-insensitive equality of two specs' GitHub conditions. */
export function sameGithubConditions(
  first: CompositeCategoryRuleSpec,
  second: CompositeCategoryRuleSpec,
): boolean {
  const key = (spec: CompositeCategoryRuleSpec): string =>
    describeGithubConditions(spec).map(normaliseKey).sort().join("");
  return key(first) === key(second);
}
