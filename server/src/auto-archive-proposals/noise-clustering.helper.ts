import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import {
  bodyHead,
  featureTokens,
  templateSignature,
} from "./noise-text.helper";

/**
 * Within-sender clustering: TF-IDF vectors over normalised subject + body-head
 * features, then centroid clustering with an agglomerative merge pass.
 *
 * Emails are first collapsed to distinct templates (see `templateSignature`), so
 * a sender's thousand identical CI failures cost one vector, not a thousand.
 * Clustering then runs in two cheap phases: a single leader pass that assigns
 * each template (largest first) to the most similar centroid, and an
 * agglomerative pass that keeps merging the closest pair of centroids while it
 * clears the similarity threshold. Deterministic for a given input order.
 */

type SparseVector = Map<string, number>;

/** What the clusterer needs to know about one email. */
export interface ClusterableEmail {
  subject: string;
  body: string;
}

interface Template {
  memberIndexes: number[];
  vector: SparseVector;
}

interface Cluster {
  memberIndexes: number[];
  centroid: SparseVector;
}

const SUBJECT_PREFIX = "s:";
const BIGRAM_PREFIX = "s2:";
const BODY_PREFIX = "b:";

function addTerm(vector: SparseVector, term: string, weight: number): void {
  vector.set(term, (vector.get(term) ?? 0) + weight);
}

function termCounts(email: ClusterableEmail): SparseVector {
  const counts: SparseVector = new Map();
  const subjectWords = featureTokens(email.subject);
  const subjectWeight = AUTO_ARCHIVE_PROPOSAL_CONFIG.SUBJECT_FEATURE_WEIGHT;
  subjectWords.forEach((word, index) => {
    addTerm(counts, `${SUBJECT_PREFIX}${word}`, subjectWeight);
    if (index > 0) {
      addTerm(
        counts,
        `${BIGRAM_PREFIX}${subjectWords[index - 1]}_${word}`,
        subjectWeight,
      );
    }
  });
  featureTokens(bodyHead(email.body))
    .slice(0, AUTO_ARCHIVE_PROPOSAL_CONFIG.BODY_FEATURE_TOKENS)
    .forEach((word) => addTerm(counts, `${BODY_PREFIX}${word}`, 1));
  return counts;
}

function norm(vector: SparseVector): number {
  let sum = 0;
  for (const weight of vector.values()) sum += weight * weight;
  return Math.sqrt(sum);
}

/** Cosine similarity of two sparse vectors (0 when either is empty). */
export function cosineSimilarity(
  left: SparseVector,
  right: SparseVector,
): number {
  const [small, large] =
    left.size <= right.size ? [left, right] : [right, left];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  const denominator = norm(left) * norm(right);
  return denominator === 0 ? 0 : dot / denominator;
}

function groupTemplates(emails: ClusterableEmail[]): Template[] {
  const bySignature = new Map<string, number[]>();
  emails.forEach((email, index) => {
    const signature = templateSignature(email.subject, email.body);
    const members = bySignature.get(signature);
    if (members) members.push(index);
    else bySignature.set(signature, [index]);
  });
  return [...bySignature.entries()]
    .sort(
      ([leftSig, leftMembers], [rightSig, rightMembers]) =>
        rightMembers.length - leftMembers.length ||
        leftSig.localeCompare(rightSig),
    )
    .map(([, memberIndexes]) => ({
      memberIndexes,
      vector: termCounts(emails[memberIndexes[0]]),
    }));
}

/** Re-weights raw term counts by inverse template frequency (smoothed idf). */
function applyIdf(templates: Template[]): void {
  const documentFrequency = new Map<string, number>();
  for (const template of templates) {
    for (const term of template.vector.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const total = templates.length;
  for (const template of templates) {
    for (const [term, count] of template.vector) {
      const idf =
        Math.log((1 + total) / (1 + (documentFrequency.get(term) ?? 0))) + 1;
      template.vector.set(term, count * idf);
    }
  }
}

function addScaled(target: SparseVector, source: SparseVector, scale: number) {
  const sourceNorm = norm(source) || 1;
  for (const [term, weight] of source) {
    addTerm(target, term, (weight / sourceNorm) * scale);
  }
}

function leaderPass(templates: Template[], threshold: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (const template of templates) {
    let best: Cluster | null = null;
    let bestSimilarity: number = threshold;
    for (const cluster of clusters) {
      const similarity = cosineSimilarity(template.vector, cluster.centroid);
      if (similarity >= bestSimilarity) {
        best = cluster;
        bestSimilarity = similarity;
      }
    }
    const weight = template.memberIndexes.length;
    if (best) {
      best.memberIndexes.push(...template.memberIndexes);
      addScaled(best.centroid, template.vector, weight);
    } else {
      const centroid: SparseVector = new Map();
      addScaled(centroid, template.vector, weight);
      clusters.push({ memberIndexes: [...template.memberIndexes], centroid });
    }
  }
  return clusters;
}

function closestPair(
  clusters: Cluster[],
  threshold: number,
): [number, number] | null {
  let pair: [number, number] | null = null;
  let bestSimilarity = threshold;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const similarity = cosineSimilarity(
        clusters[i].centroid,
        clusters[j].centroid,
      );
      if (similarity >= bestSimilarity) {
        pair = [i, j];
        bestSimilarity = similarity;
      }
    }
  }
  return pair;
}

function mergePass(clusters: Cluster[], threshold: number): Cluster[] {
  const merged = [...clusters];
  for (
    let pair = closestPair(merged, threshold);
    pair;
    pair = closestPair(merged, threshold)
  ) {
    const [keep, drop] = pair;
    merged[keep].memberIndexes.push(...merged[drop].memberIndexes);
    for (const [term, weight] of merged[drop].centroid) {
      addTerm(merged[keep].centroid, term, weight);
    }
    merged.splice(drop, 1);
  }
  return merged;
}

/**
 * Clusters one sender's emails at the given cosine threshold. Returns groups of
 * indexes into `emails`, largest first, each sorted ascending.
 */
export function clusterEmails(
  emails: ClusterableEmail[],
  threshold: number = AUTO_ARCHIVE_PROPOSAL_CONFIG.CLUSTER_SIMILARITY_THRESHOLD,
): number[][] {
  if (emails.length === 0) return [];
  const templates = groupTemplates(emails);
  applyIdf(templates);
  return mergePass(leaderPass(templates, threshold), threshold)
    .map((cluster) =>
      [...cluster.memberIndexes].sort((left, right) => left - right),
    )
    .sort((left, right) => right.length - left.length || left[0] - right[0]);
}
