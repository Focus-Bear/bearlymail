import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { WorkflowCondition } from "../workflows/types/workflow.types";
import {
  AnalysedEmail,
  ArchiveRuleCondition,
  ProposalDraft,
  ProposalEvidence,
  SenderGroup,
} from "./auto-archive-proposals.types";
import {
  isLowEngagement,
  tallyEngagement,
  wilsonUpperBound,
} from "./engagement.helper";
import { clusterEmails } from "./noise-clustering.helper";
import { findClusterCondition } from "./rule-condition.helper";
import {
  isPrecise,
  matchingEmails,
  simulateRule,
} from "./rule-simulation.helper";

/**
 * The per-sender pipeline, pure and in memory:
 *
 *   1. Split the sender's window into a training slice (older) and a held-out
 *      slice (most recent HOLDOUT_FRACTION).
 *   2. If the whole training slice is low-engagement and the sender-only rule
 *      survives validation, propose just that. Otherwise cluster the slice and
 *      keep the low-engagement clusters (Wilson upper bound, so small clusters
 *      never qualify), each turned into a minimal keyword condition.
 *   3. Validate each candidate on the held-out slice (it must still fire, and
 *      catch nothing engaged) and over the whole window (same safeguard).
 *   4. Drop candidates an existing archive rule, or a proposal the user already
 *      approved or dismissed, mostly covers.
 */

interface CandidateCondition {
  condition: ArchiveRuleCondition;
  clusterSize: number;
}

function splitHoldout(emails: AnalysedEmail[]) {
  const trainingCount = Math.floor(
    emails.length * (1 - AUTO_ARCHIVE_PROPOSAL_CONFIG.HOLDOUT_FRACTION),
  );
  return {
    training: emails.slice(0, trainingCount),
    holdout: emails.slice(trainingCount),
  };
}

function conditionKey(condition: ArchiveRuleCondition): string {
  return JSON.stringify([
    condition.senderPattern,
    [...condition.subjectPatterns].sort(),
    [...condition.bodyPatterns].sort(),
  ]);
}

/** Distinct notification sub-streams among `emails` (unrecognised mail counts as one). */
function notificationSubtypeCount(emails: AnalysedEmail[]): number {
  return new Set(emails.map((email) => email.notificationSubtype)).size;
}

/**
 * The whole sender as one candidate, when the sender itself is noise. Never
 * for a sender that sends several kinds of notification: "archive everything
 * from GitHub" would also hide review requests and mentions the sample merely
 * happened not to contain, so those senders get one keyword rule per kind.
 */
function senderWideCandidate(
  senderPattern: string,
  training: AnalysedEmail[],
): CandidateCondition | null {
  if (notificationSubtypeCount(training) > 1) return null;
  if (!isLowEngagement(tallyEngagement(training))) return null;
  return {
    condition: { senderPattern, subjectPatterns: [], bodyPatterns: [] },
    clusterSize: training.length,
  };
}

function addCandidate(
  candidates: Map<string, CandidateCondition>,
  condition: ArchiveRuleCondition,
  clusterSize: number,
): void {
  const key = conditionKey(condition);
  const existing = candidates.get(key);
  candidates.set(key, {
    condition,
    clusterSize: (existing?.clusterSize ?? 0) + clusterSize,
  });
}

/**
 * Walks the cluster hierarchy: a low-engagement cluster becomes a candidate; a
 * cluster the user engages with is re-clustered tighter in case a noisy
 * template is hiding inside it.
 */
function collectClusterCandidates(
  emails: AnalysedEmail[],
  training: AnalysedEmail[],
  senderPattern: string,
  threshold: number,
  candidates: Map<string, CandidateCondition>,
): void {
  const config = AUTO_ARCHIVE_PROPOSAL_CONFIG;
  for (const indexes of clusterEmails(emails, threshold)) {
    if (indexes.length < config.MIN_CLUSTER_SIZE) break;
    const cluster = indexes.map((index) => emails[index]);
    if (isLowEngagement(tallyEngagement(cluster))) {
      const condition = findClusterCondition(cluster, training, senderPattern);
      if (condition) addCandidate(candidates, condition, cluster.length);
      continue;
    }
    const tighter = threshold + config.CLUSTER_REFINE_STEP;
    if (tighter <= config.MAX_CLUSTER_SIMILARITY_THRESHOLD) {
      collectClusterCandidates(
        cluster,
        training,
        senderPattern,
        tighter,
        candidates,
      );
    }
  }
}

/** Emails grouped by notification sub-stream, first-seen order. */
function partitionBySubtype(emails: AnalysedEmail[]): AnalysedEmail[][] {
  const partitions = new Map<string | null, AnalysedEmail[]>();
  for (const email of emails) {
    const partition = partitions.get(email.notificationSubtype) ?? [];
    partition.push(email);
    partitions.set(email.notificationSubtype, partition);
  }
  return [...partitions.values()];
}

/**
 * Keyword conditions mined from the training slice's low-engagement clusters.
 * Clusters are formed within each notification sub-stream, so a noisy kind
 * (CI failures) is never averaged with a kind the user reads (review
 * requests). Phrases are still scored against ALL the sender's mail, so the
 * chosen keyword separates the kind from everything else the sender sends.
 */
export function mineClusterCandidates(
  senderPattern: string,
  training: AnalysedEmail[],
): CandidateCondition[] {
  const candidates = new Map<string, CandidateCondition>();
  for (const partition of partitionBySubtype(training)) {
    collectClusterCandidates(
      partition,
      training,
      senderPattern,
      AUTO_ARCHIVE_PROPOSAL_CONFIG.CLUSTER_SIMILARITY_THRESHOLD,
      candidates,
    );
  }
  return [...candidates.values()];
}

function isSuppressed(
  matched: AnalysedEmail[],
  suppressors: WorkflowCondition[],
): boolean {
  return suppressors.some(
    (suppressor) =>
      matchingEmails(suppressor, matched).length >=
      matched.length * AUTO_ARCHIVE_PROPOSAL_CONFIG.SUPPRESSION_OVERLAP_SHARE,
  );
}

function buildEvidence(
  group: SenderGroup,
  candidate: CandidateCondition,
  holdout: AnalysedEmail[],
): ProposalEvidence | null {
  const holdoutRun = simulateRule(candidate.condition, holdout);
  if (
    holdoutRun.stats.matched <
      AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_HOLDOUT_MATCHES ||
    !isPrecise(holdoutRun.stats)
  ) {
    return null;
  }
  const windowRun = simulateRule(candidate.condition, group.emails);
  if (!isPrecise(windowRun.stats)) return null;
  const { matched } = windowRun;
  return {
    windowDays: AUTO_ARCHIVE_PROPOSAL_CONFIG.WINDOW_DAYS,
    senderTotal: group.emails.length,
    window: windowRun.stats,
    holdout: holdoutRun.stats,
    openRate: windowRun.stats.opened / windowRun.stats.matched,
    engagementUpperBound: wilsonUpperBound(
      windowRun.stats.engaged,
      windowRun.stats.matched,
    ),
    clusterSize: candidate.clusterSize,
    sampleSubjects: matched
      .slice(-AUTO_ARCHIVE_PROPOSAL_CONFIG.SAMPLE_SUBJECTS)
      .reverse()
      .map((email) => email.subject),
    firstMatchedAt: matched[0].receivedAt.toISOString(),
    lastMatchedAt: matched[matched.length - 1].receivedAt.toISOString(),
  };
}

/**
 * Runs the whole pipeline for one sender group. `suppressors` are the
 * conditions of the user's existing archive workflows plus every proposal they
 * already approved or dismissed for this sender.
 */
export function analyseSenderGroup(
  group: SenderGroup,
  suppressors: WorkflowCondition[] = [],
): ProposalDraft[] {
  if (group.emails.length < AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_SENDER_VOLUME) {
    return [];
  }
  const { training, holdout } = splitHoldout(group.emails);
  const toDraft = (candidate: CandidateCondition): ProposalDraft | null => {
    const evidence = buildEvidence(group, candidate, holdout);
    if (!evidence) return null;
    const { matched } = simulateRule(candidate.condition, group.emails);
    if (isSuppressed(matched, suppressors)) return null;
    return {
      senderKey: group.senderKey,
      scope: group.scope,
      senderDisplay: group.senderDisplay,
      condition: candidate.condition,
      evidence,
    };
  };

  const senderWide = senderWideCandidate(group.senderPattern, training);
  const senderWideDraft = senderWide ? toDraft(senderWide) : null;
  if (senderWideDraft) return [senderWideDraft];

  return mineClusterCandidates(group.senderPattern, training)
    .map(toDraft)
    .filter((draft): draft is ProposalDraft => draft !== null)
    .sort(
      (left, right) =>
        right.evidence.window.matched - left.evidence.window.matched,
    );
}
