/**
 * ONE facts model for GitHub notification emails, assembled from BOTH sources
 * the categoriser has:
 *   - message-level facts recovered from the email text (item, event, acting
 *     account kind, "you are receiving this because" reason, fine subtype —
 *     see `github-notification-facts.util.ts`), and
 *   - thread-level facts fetched from the GitHub API and cached on
 *     `EmailThread.githubMetadata` for the PR/issue the email is about (state,
 *     merged, PR/issue AUTHOR kind, GitHub Projects board status, labels,
 *     review status, CI checks).
 *
 * The deterministic category rules pin these fields directly (`githubStateAny`,
 * `githubProjectStatusAny`, …) and the category prompt receives them as an
 * authoritative "GitHub facts" block, so both consumers see exactly the same
 * facts. Pure — the freshness fetch lives in `GithubCategorySignalsService`.
 */
import {
  GITHUB_ACTOR_KINDS,
  GITHUB_AUTHOR_TYPES,
  GITHUB_ITEM_STATES,
  GITHUB_NOTIFICATION_ITEMS,
  GithubActorKind,
  GithubItemState,
  GithubNotificationEvent,
  GithubNotificationReason,
} from "../constants/github-notification.constants";
import type { EmailThread } from "../database/entities/email-thread.entity";
import { resolveNotificationSubtype } from "../utils/notification-subtype.util";
import {
  GitHubService,
  isGitHubNotificationEmail,
  ParsedGitHubLink,
} from "./github.service";
import type { GithubNotificationLinkType } from "./github-link-type.util";
import {
  detectGithubNotificationFacts,
  isGithubBotLogin,
} from "./github-notification-facts.util";

export type ThreadGithubMetadata = NonNullable<EmailThread["githubMetadata"]>;
export type ThreadGithubMetadataLink = ThreadGithubMetadata["links"][number];
type ThreadGithubLinkStatus = NonNullable<ThreadGithubMetadataLink["status"]>;

/** The email fields the signals are derived from. */
export interface GithubSignalsEmailInput {
  from: string;
  subject: string;
  body?: string | null;
  htmlBody?: string | null;
  receivedAt?: Date | string | null;
}

/** A GitHub Projects (v2) board membership with its "Status" field value. */
export interface GithubProjectStatusSignal {
  project: string;
  status: string;
}

export interface GithubItemReference {
  owner: string;
  repo: string;
  number: number;
}

export interface GithubCategorySignals {
  /** PR or issue; null when neither the text nor the metadata identifies it. */
  item: GithubNotificationLinkType | null;
  reference: GithubItemReference | null;
  /** Fine notification subtype (`github:pr:merged:human`), when resolvable. */
  subtype: string | null;
  event: GithubNotificationEvent | null;
  /** Kind of the account that ACTED (commented, merged, …) in this message. */
  actorKind: GithubActorKind | null;
  actorLogin: string | null;
  reason: GithubNotificationReason | null;
  /** Lifecycle state of the PR/issue from the fetched metadata. */
  state: GithubItemState | null;
  /** Kind of the account that AUTHORED (opened) the PR/issue. */
  authorKind: GithubActorKind | null;
  authorLogin: string | null;
  projectStatuses: GithubProjectStatusSignal[];
  labels: string[];
  reviewStatus: string | null;
  checksState: string | null;
  /** ISO time the metadata for this item was fetched; null when never fetched. */
  metadataFetchedAt: string | null;
  /** True when no status was fetched for this item or the email is newer than the fetch. */
  metadataStale: boolean;
}

const PROMPT_FIELD_SEPARATOR = " · ";
const LIST_SEPARATOR = ", ";
const NO_FACTS_LABEL = "none available";
const BOT_LOGIN_SUFFIX_PATTERN = /\[bot\]$/i;

const linkParser = new GitHubService();

/** Every PR/issue link the email itself references (body, HTML, then subject). */
export function parseEmailGithubLinks(
  email: GithubSignalsEmailInput,
): ParsedGitHubLink[] {
  const fromBody = linkParser.parseGitHubLinks(
    email.body ?? "",
    email.htmlBody ?? undefined,
  );
  if (fromBody.length > 0) {
    return fromBody;
  }
  return linkParser.parseGitHubLinksFromSubject(
    email.subject ?? "",
    email.body ?? undefined,
  );
}

function sameReference(
  link: ThreadGithubMetadataLink,
  candidate: ParsedGitHubLink,
): boolean {
  return (
    link.url.toLowerCase() === candidate.url.toLowerCase() ||
    (link.number === candidate.number &&
      link.owner.toLowerCase() === candidate.owner.toLowerCase() &&
      link.repo.toLowerCase() === candidate.repo.toLowerCase())
  );
}

function fetchedAtMillis(link: ThreadGithubMetadataLink): number {
  const stamp = link.status ? link.fetchedAt : undefined;
  const millis = stamp ? new Date(stamp).getTime() : Number.NaN;
  return Number.isNaN(millis) ? 0 : millis;
}

/**
 * The cached metadata link the email is about: the one it references (by URL,
 * else owner/repo/number), falling back to the most recently fetched link when
 * the email references none of them (a plain reply with no link in it).
 */
export function selectMetadataLinkForEmail(
  links: ThreadGithubMetadataLink[],
  emailLinks: ParsedGitHubLink[],
): ThreadGithubMetadataLink | null {
  if (links.length === 0) {
    return null;
  }
  for (const candidate of emailLinks) {
    const referenced = links.find((link) => sameReference(link, candidate));
    if (referenced) {
      return referenced;
    }
  }
  return [...links].sort(
    (first, second) => fetchedAtMillis(second) - fetchedAtMillis(first),
  )[0];
}

/** open / closed / merged; a merged PR wins over GitHub's raw `closed` state. */
export function resolveGithubItemState(
  status: ThreadGithubLinkStatus | undefined,
): GithubItemState | null {
  if (!status) {
    return null;
  }
  if (status.merged) {
    return GITHUB_ITEM_STATES.MERGED;
  }
  const state = status.state?.toLowerCase();
  const known = Object.values(GITHUB_ITEM_STATES) as string[];
  return known.includes(state) ? (state as GithubItemState) : null;
}

/** Bot when GitHub says so or the login carries the `[bot]` suffix / known-bot list. */
export function resolveGithubAuthorKind(
  author: ThreadGithubLinkStatus["author"] | undefined,
): GithubActorKind | null {
  if (!author) {
    return null;
  }
  if (
    author.type === GITHUB_AUTHOR_TYPES.BOT ||
    BOT_LOGIN_SUFFIX_PATTERN.test(author.login ?? "") ||
    (author.login ? isGithubBotLogin(author.login) : false)
  ) {
    return GITHUB_ACTOR_KINDS.BOT;
  }
  return GITHUB_ACTOR_KINDS.HUMAN;
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

/**
 * True when the item's metadata cannot be trusted for this email: never
 * fetched, or fetched BEFORE the email arrived (the message may have changed
 * the board status / state it reports on).
 */
export function isGithubMetadataStale(
  receivedAt: Date | string | null | undefined,
  fetchedAt: string | null | undefined,
): boolean {
  const fetched = toMillis(fetchedAt);
  if (fetched === null) {
    return true;
  }
  const received = toMillis(receivedAt);
  return received !== null && received > fetched;
}

function projectStatusesOf(
  status: ThreadGithubLinkStatus | undefined,
): GithubProjectStatusSignal[] {
  return (status?.projects ?? [])
    .filter((project) => Boolean(project.name && project.status))
    .map((project) => ({
      project: project.name,
      status: project.status as string,
    }));
}

function linkFacts(
  link: ThreadGithubMetadataLink | null,
  receivedAt: Date | string | null | undefined,
): Pick<
  GithubCategorySignals,
  | "state"
  | "authorKind"
  | "authorLogin"
  | "projectStatuses"
  | "labels"
  | "reviewStatus"
  | "checksState"
  | "metadataFetchedAt"
  | "metadataStale"
> {
  const status = link?.status;
  const fetchedAt = status ? (link?.fetchedAt ?? null) : null;
  return {
    state: resolveGithubItemState(status),
    authorKind: resolveGithubAuthorKind(status?.author),
    authorLogin: status?.author?.login ?? null,
    projectStatuses: projectStatusesOf(status),
    labels: (status?.labels ?? [])
      .map((label) => label.name)
      .filter((name): name is string => Boolean(name)),
    reviewStatus: status?.reviewStatus ?? null,
    checksState: status?.checks?.state ?? null,
    metadataFetchedAt: fetchedAt,
    metadataStale: isGithubMetadataStale(receivedAt, fetchedAt),
  };
}

/**
 * Builds the signals for one email of a thread, or null when the email is not
 * a GitHub PR/issue notification (non-GitHub senders, CI-run notifications
 * with no referenced item). Metadata may be missing — the message-level facts
 * are still returned, with `metadataStale: true`.
 */
/** The message-level half of the signals: what happened, and who did it. */
function messageFacts(
  facts: ReturnType<typeof detectGithubNotificationFacts>,
): Pick<
  GithubCategorySignals,
  "event" | "actorKind" | "actorLogin" | "reason"
> {
  return {
    event: facts?.event ?? null,
    actorKind: facts?.actorKind ?? null,
    actorLogin: facts?.actorLogin ?? null,
    reason: facts?.reason ?? null,
  };
}

function referenceOf(
  candidate: { owner: string; repo: string; number: number } | null,
): GithubItemReference | null {
  return candidate
    ? {
        owner: candidate.owner,
        repo: candidate.repo,
        number: candidate.number,
      }
    : null;
}

export function buildGithubCategorySignals(
  email: GithubSignalsEmailInput,
  metadata: ThreadGithubMetadata | null | undefined,
): GithubCategorySignals | null {
  if (!isGitHubNotificationEmail(email.from)) {
    return null;
  }
  const facts = detectGithubNotificationFacts(
    email.from,
    email.subject,
    email.body,
    email.htmlBody,
  );
  const emailLinks = parseEmailGithubLinks(email);
  const link = selectMetadataLinkForEmail(metadata?.links ?? [], emailLinks);
  const referencedLink = emailLinks[0] ?? null;
  if (!facts && !link && !referencedLink) {
    return null;
  }
  const linkedItem = link?.type ?? referencedLink?.type ?? null;
  return {
    item: facts?.item ?? linkedItem,
    reference: referenceOf(link ?? referencedLink),
    subtype: resolveNotificationSubtype({
      from: email.from,
      subject: email.subject,
      body: email.body,
      htmlBody: email.htmlBody,
    }),
    ...messageFacts(facts),
    ...linkFacts(link, email.receivedAt),
  };
}

/**
 * Whether the category step should refresh the thread's GitHub metadata
 * before running: the email is a GitHub PR/issue notification whose item has
 * no fetched status, or whose status was fetched before this email arrived.
 */
export function needsGithubMetadataRefresh(
  email: GithubSignalsEmailInput,
  metadata: ThreadGithubMetadata | null | undefined,
): boolean {
  const signals = buildGithubCategorySignals(email, metadata);
  return signals !== null && signals.metadataStale;
}

function describeActor(
  kind: GithubActorKind | null,
  login: string | null,
): string | null {
  if (!kind) {
    return null;
  }
  return login ? `${kind} (${login})` : kind;
}

/** How each linked item type is named in the facts line. */
const ITEM_LABELS: Record<GithubNotificationLinkType, string> = {
  [GITHUB_NOTIFICATION_ITEMS.PR]: "PR",
  [GITHUB_NOTIFICATION_ITEMS.ISSUE]: "issue",
};

const UNKNOWN_ITEM_LABEL = "item";

function itemLabel(item: GithubNotificationLinkType | null): string {
  return item ? ITEM_LABELS[item] : UNKNOWN_ITEM_LABEL;
}

/**
 * The compact, single-line facts block the category prompt receives, e.g.
 * `Item: PR #430 Focus-Bear/assets · state: merged · event: merged by human
 * (octocat) · PR author: bot (devin-ai-integration[bot]) · project status:
 * QA passed (Mac App roadmap) · labels: bug · checks: passing`. Only present
 * facts are rendered; a stale fetch is flagged so the model does not treat an
 * outdated board status as the outcome of the message it is reading.
 */
export function formatGithubFactsForPrompt(
  signals: GithubCategorySignals,
): string {
  const label = itemLabel(signals.item);
  const parts: string[] = [];
  parts.push(
    signals.reference
      ? `Item: ${label} #${signals.reference.number} ${signals.reference.owner}/${signals.reference.repo}`
      : `Item: ${label}`,
  );
  if (signals.state) {
    parts.push(`state: ${signals.state}`);
  }
  const actor = describeActor(signals.actorKind, signals.actorLogin);
  if (signals.event) {
    parts.push(`event: ${signals.event}${actor ? ` by ${actor}` : ""}`);
  }
  const author = describeActor(signals.authorKind, signals.authorLogin);
  if (author) {
    parts.push(`${label} author: ${author}`);
  }
  if (signals.projectStatuses.length > 0) {
    parts.push(
      `project status: ${signals.projectStatuses
        .map((entry) => `${entry.status} (${entry.project})`)
        .join(LIST_SEPARATOR)}`,
    );
  }
  if (signals.labels.length > 0) {
    parts.push(`labels: ${signals.labels.join(LIST_SEPARATOR)}`);
  }
  if (signals.reviewStatus) {
    parts.push(`review: ${signals.reviewStatus}`);
  }
  if (signals.checksState) {
    parts.push(`checks: ${signals.checksState}`);
  }
  if (signals.metadataStale && signals.metadataFetchedAt) {
    parts.push("status fetched before this email arrived (may be outdated)");
  } else if (signals.metadataStale) {
    parts.push("no fetched status");
  }
  return parts.join(PROMPT_FIELD_SEPARATOR);
}

/** `GitHub facts: …` / `GitHub facts: none available` for decision traces. */
export function describeGithubFactsForTrace(
  signals: GithubCategorySignals | null | undefined,
): string {
  return `GitHub facts: ${
    signals ? formatGithubFactsForPrompt(signals) : NO_FACTS_LABEL
  }`;
}

/**
 * The trace line for one email: the facts when it is a GitHub notification
 * (`none available` when nothing could be resolved for it), and null for
 * ordinary mail, where a "no GitHub facts" note would be pure noise.
 */
export function githubFactsTraceDetail(
  email: GithubSignalsEmailInput,
  signals: GithubCategorySignals | null | undefined,
): string | null {
  if (!signals && !isGitHubNotificationEmail(email.from)) {
    return null;
  }
  return describeGithubFactsForTrace(signals);
}
