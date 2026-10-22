import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import {
  AnalysedEmail,
  ArchiveRuleCondition,
} from "./auto-archive-proposals.types";
import { bodyHead, extractPhrases, featureTokens } from "./noise-text.helper";
import { isPrecise, simulateRule } from "./rule-simulation.helper";

/**
 * Rule-condition extraction: the smallest keyword condition that captures a
 * noise cluster without touching anything the user engaged with.
 *
 * Candidates are phrases most of the cluster shares (document frequency ≥ the
 * coverage threshold). Each is replayed over ALL of the sender's emails, so a
 * phrase the cluster shares with mail the user does open — a repo name, the
 * sender's footer — is rejected by the precision safeguard rather than by any
 * sender-specific knowledge.
 *
 * Preference order: one subject phrase, then one body phrase, then a subject
 * AND body pair. Within a shape: higher cluster coverage, then more
 * DISTINCTIVE words (words the sender's other mail rarely contains — so the
 * rule is about what makes this cluster different, not what every
 * notification from the sender says), then distinctive content that comes
 * earlier in the text, then fewer words (the minimal condition), then lexical
 * order.
 */

export const PHRASE_FIELD = {
  SUBJECT: "subject",
  BODY: "body",
} as const;

export type PhraseField = (typeof PHRASE_FIELD)[keyof typeof PHRASE_FIELD];

interface ScoredCondition {
  condition: ArchiveRuleCondition;
  coverage: number;
  distinctiveWords: number;
  position: number;
  words: number;
  label: string;
}

/** Share of the sender's non-cluster emails containing each feature word. */
type OutsideWordShare = Record<PhraseField, Map<string, number>>;

interface ExtractionContext {
  cluster: AnalysedEmail[];
  senderEmails: AnalysedEmail[];
  senderPattern: string;
  outside: OutsideWordShare;
}

function fieldText(email: AnalysedEmail, field: PhraseField): string {
  return field === PHRASE_FIELD.SUBJECT ? email.subject : bodyHead(email.body);
}

/** Phrases present in at least the coverage share of the cluster, most common first. */
export function sharedPhrases(
  cluster: AnalysedEmail[],
  field: PhraseField,
): string[] {
  const documentFrequency = new Map<string, number>();
  for (const email of cluster) {
    for (const phrase of extractPhrases(fieldText(email, field))) {
      documentFrequency.set(phrase, (documentFrequency.get(phrase) ?? 0) + 1);
    }
  }
  const minimum = Math.ceil(
    cluster.length * AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_KEYWORD_COVERAGE,
  );
  return [...documentFrequency.entries()]
    .filter(([, count]) => count >= minimum)
    .sort(
      ([leftPhrase, leftCount], [rightPhrase, rightCount]) =>
        rightCount - leftCount || leftPhrase.localeCompare(rightPhrase),
    )
    .map(([phrase]) => phrase);
}

function wordShare(emails: AnalysedEmail[], field: PhraseField) {
  const counts = new Map<string, number>();
  for (const email of emails) {
    for (const word of new Set(featureTokens(fieldText(email, field)))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const total = Math.max(1, emails.length);
  return new Map([...counts].map(([word, count]) => [word, count / total]));
}

function outsideWordShare(
  cluster: AnalysedEmail[],
  senderEmails: AnalysedEmail[],
): OutsideWordShare {
  const clusterIds = new Set(cluster.map((email) => email.id));
  const outside = senderEmails.filter((email) => !clusterIds.has(email.id));
  return {
    subject: wordShare(outside, PHRASE_FIELD.SUBJECT),
    body: wordShare(outside, PHRASE_FIELD.BODY),
  };
}

interface PhraseProfile {
  distinctive: number;
  words: number;
  /** Mean character offset, in the cluster's texts, of the first distinctive word. */
  position: number;
}

function isDistinctive(word: string, shares: Map<string, number>): boolean {
  return (
    (shares.get(word) ?? 0) <=
    AUTO_ARCHIVE_PROPOSAL_CONFIG.DISTINCTIVE_MAX_OUTSIDE_SHARE
  );
}

/**
 * Where the phrase's distinctive content starts, averaged over the cluster.
 * Earlier wins the tie: the headline of a notification says what it is, its
 * footer ("triggered by: Send a notification for …") rarely reads as well.
 */
function meanPosition(
  phrase: string,
  firstDistinctive: string | undefined,
  texts: string[],
): number {
  const offsets = texts
    .map((text) => text.toLowerCase().indexOf(phrase))
    .filter((offset) => offset >= 0)
    .map((offset) =>
      firstDistinctive ? offset + phrase.indexOf(firstDistinctive) : offset,
    );
  if (offsets.length === 0) return Number.MAX_SAFE_INTEGER;
  return offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
}

function profilePhrases(
  phrases: string[],
  shares: Map<string, number>,
  texts: string[],
): PhraseProfile {
  const profile: PhraseProfile = { distinctive: 0, words: 0, position: 0 };
  for (const phrase of phrases) {
    const words = featureTokens(phrase);
    const distinctive = words.filter((word) => isDistinctive(word, shares));
    profile.distinctive += distinctive.length;
    profile.words += words.length;
    profile.position += meanPosition(phrase, distinctive[0], texts);
  }
  return profile;
}

function scoreCondition(
  condition: ArchiveRuleCondition,
  context: ExtractionContext,
): ScoredCondition | null {
  const { cluster, senderEmails, outside } = context;
  if (!isPrecise(simulateRule(condition, senderEmails).stats)) return null;
  const coverage =
    simulateRule(condition, cluster).stats.matched / cluster.length;
  if (coverage < AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_KEYWORD_COVERAGE) {
    return null;
  }
  const subject = profilePhrases(
    condition.subjectPatterns,
    outside.subject,
    cluster.map((email) => fieldText(email, PHRASE_FIELD.SUBJECT)),
  );
  const body = profilePhrases(
    condition.bodyPatterns,
    outside.body,
    cluster.map((email) => fieldText(email, PHRASE_FIELD.BODY)),
  );
  return {
    condition,
    coverage,
    distinctiveWords: subject.distinctive + body.distinctive,
    position: subject.position + body.position,
    words: subject.words + body.words,
    label: [...condition.subjectPatterns, ...condition.bodyPatterns].join("|"),
  };
}

function best(candidates: Array<ScoredCondition | null>) {
  return candidates
    .filter((candidate): candidate is ScoredCondition => candidate !== null)
    .sort(
      (left, right) =>
        right.coverage - left.coverage ||
        right.distinctiveWords - left.distinctiveWords ||
        left.position - right.position ||
        left.words - right.words ||
        left.label.localeCompare(right.label),
    )[0];
}

function buildCondition(
  senderPattern: string,
  subjectPatterns: string[],
  bodyPatterns: string[],
): ArchiveRuleCondition {
  return { senderPattern, subjectPatterns, bodyPatterns };
}

function pairConditions(
  senderPattern: string,
  subjectPhrases: string[],
  bodyPhrases: string[],
): ArchiveRuleCondition[] {
  const limit = AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_PAIR_CANDIDATES;
  return subjectPhrases
    .slice(0, limit)
    .flatMap((subjectPhrase) =>
      bodyPhrases
        .slice(0, limit)
        .map((bodyPhrase) =>
          buildCondition(senderPattern, [subjectPhrase], [bodyPhrase]),
        ),
    );
}

/**
 * Finds the keyword condition for a noise cluster, or null when no condition
 * both covers the cluster and passes the precision safeguard.
 */
export function findClusterCondition(
  cluster: AnalysedEmail[],
  senderEmails: AnalysedEmail[],
  senderPattern: string,
): ArchiveRuleCondition | null {
  const context: ExtractionContext = {
    cluster,
    senderEmails,
    senderPattern,
    outside: outsideWordShare(cluster, senderEmails),
  };
  const score = (candidate: ArchiveRuleCondition) =>
    scoreCondition(candidate, context);

  const subjectPhrases = sharedPhrases(cluster, PHRASE_FIELD.SUBJECT);
  const subjectOnly = best(
    subjectPhrases.map((phrase) =>
      score(buildCondition(senderPattern, [phrase], [])),
    ),
  );
  if (subjectOnly) return subjectOnly.condition;

  const bodyPhrases = sharedPhrases(cluster, PHRASE_FIELD.BODY);
  const bodyOnly = best(
    bodyPhrases.map((phrase) =>
      score(buildCondition(senderPattern, [], [phrase])),
    ),
  );
  if (bodyOnly) return bodyOnly.condition;

  const pair = best(
    pairConditions(senderPattern, subjectPhrases, bodyPhrases).map(score),
  );
  return pair?.condition ?? null;
}
