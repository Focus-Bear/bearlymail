import {
  AUTOMATED_SENDER_PATTERNS,
  AUTOMATED_SUBJECT_PATTERNS,
  matchesAnyPattern,
  NEWSLETTER_SENDER_PATTERNS,
  NEWSLETTER_SUBJECT_PATTERNS,
  TRANSACTIONAL_SENDER_PATTERNS,
  TRANSACTIONAL_SUBJECT_PATTERNS,
} from "../auto-responder/automated-email-patterns";
import { QA_EXTRACTION } from "../constants/llm-constants";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import type { ExtractedQaCluster } from "../llm/qa-extraction-response";
import { extractEmailAddress } from "../utils/email-address.utils";

/** A message the user sent, as fetched from their Sent folder. */
export interface QaSentReply {
  threadId: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
}

/** A synced message someone sent the user. */
export interface QaInboundMessage {
  threadId: string;
  from: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
}

/** One real question and the user's reply to it, ready for the model. */
export interface QaCandidatePair {
  id: number;
  /** Lower-cased sender address; never sent to the model. */
  askerAddress: string;
  /** "Person 3": lets the model see who asked without seeing their address. */
  askerLabel: string;
  subject: string;
  question: string;
  reply: string;
}

export interface VerifiedFaq {
  question: string;
  answer: string;
  askerCount: number;
}

// A direct question mark, or the ways people ask without one ("Could you send…").
const REQUEST_PHRASE =
  /\b(can|could|would|will) you\b|\bdo (you|we|i)\b|\bis (there|it)\b|\bhow (do|does|can|much|many|long)\b|\bwhat('s| is| are| does)\b|\bwhen (is|will|can|does)\b|\bwhere (is|can|do)\b|\bplease (let me know|advise|confirm|send)\b|\bwondering\b/i;

// "Re:" in English, German ("AW:") and Scandinavian ("SV:") mail clients.
const REPLY_SUBJECT_PREFIX = /^\s*(re|aw|sv)\s*:/i;

// The facts an answer can get wrong: links, email addresses and numbers
// (prices, times, counts, percentages).
const VERIFIABLE_FACT =
  /https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\d+(?:[.,:]\d+)*/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

const PERSON_LABEL_PREFIX = "Person";
const QUESTION_MARK = "?";

function isMachineSender(address: string): boolean {
  return (
    matchesAnyPattern(address, AUTOMATED_SENDER_PATTERNS) ||
    matchesAnyPattern(address, NEWSLETTER_SENDER_PATTERNS) ||
    matchesAnyPattern(address, TRANSACTIONAL_SENDER_PATTERNS)
  );
}

/**
 * Receipt and invite subjects only mark machine mail when they open the
 * thread: a person writing back on "Re: Your order #123" is a customer asking
 * about their order, which is exactly the kind of question an FAQ is for.
 */
function isMachineSubject(subject: string): boolean {
  if (
    matchesAnyPattern(subject, AUTOMATED_SUBJECT_PATTERNS) ||
    matchesAnyPattern(subject, NEWSLETTER_SUBJECT_PATTERNS)
  ) {
    return true;
  }
  if (REPLY_SUBJECT_PREFIX.test(subject)) return false;
  return matchesAnyPattern(subject, TRANSACTIONAL_SUBJECT_PATTERNS);
}

/** True for mail no person wrote: notifications, newsletters, receipts, invites. */
export function isMachineMail(from: string, subject: string): boolean {
  return (
    isMachineSender(extractEmailAddress(from)) || isMachineSubject(subject)
  );
}

export function looksLikeQuestion(text: string): boolean {
  return text.includes(QUESTION_MARK) || REQUEST_PHRASE.test(text);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** The latest message from someone else in the thread, sent before the reply. */
function findQuestionFor(
  reply: QaSentReply,
  inboundByThread: Map<string, QaInboundMessage[]>,
  userAddresses: Set<string>,
): QaInboundMessage | undefined {
  const earlier = (inboundByThread.get(reply.threadId) ?? []).filter(
    (message) =>
      message.receivedAt < reply.receivedAt &&
      !userAddresses.has(extractEmailAddress(message.from)),
  );
  return earlier.sort(
    (first, second) => second.receivedAt.getTime() - first.receivedAt.getTime(),
  )[0];
}

function groupByThread(
  messages: QaInboundMessage[],
): Map<string, QaInboundMessage[]> {
  const byThread = new Map<string, QaInboundMessage[]>();
  for (const message of messages) {
    byThread.set(message.threadId, [
      ...(byThread.get(message.threadId) ?? []),
      message,
    ]);
  }
  return byThread;
}

/** "Person 1", "Person 2"…: a stable label per sender for this run. */
function labelAsker(
  address: string,
  labelByAddress: Map<string, string>,
): string {
  const existing = labelByAddress.get(address);
  if (existing) return existing;
  const label = `${PERSON_LABEL_PREFIX} ${labelByAddress.size + 1}`;
  labelByAddress.set(address, label);
  return label;
}

/**
 * Pairs each of the user's replies with the message it answered, keeping only
 * real questions from real people that the user answered with substance.
 * Dropped: replies with no earlier message from someone else (new mail,
 * forwards), threads the auto-responder replied in (its canned text would look
 * like a perfect FAQ), machine mail, messages with no question and one-line
 * replies. One pair per thread, so a long back-and-forth counts once.
 */
export function buildQaCandidatePairs(options: {
  sentReplies: QaSentReply[];
  inboundMessages: QaInboundMessage[];
  userAddresses: Set<string>;
  automatedReplyThreadIds: Set<string>;
}): QaCandidatePair[] {
  const {
    sentReplies,
    inboundMessages,
    userAddresses,
    automatedReplyThreadIds,
  } = options;
  const inboundByThread = groupByThread(inboundMessages);
  const labelByAddress = new Map<string, string>();
  const usedThreads = new Set<string>();
  const pairs: QaCandidatePair[] = [];

  const newestFirst = [...sentReplies].sort(
    (first, second) => second.receivedAt.getTime() - first.receivedAt.getTime(),
  );
  for (const reply of newestFirst) {
    if (pairs.length >= QA_EXTRACTION.MAX_PAIRS_PER_RUN) break;
    if (usedThreads.has(reply.threadId)) continue;
    if (automatedReplyThreadIds.has(reply.threadId)) continue;

    const inbound = findQuestionFor(reply, inboundByThread, userAddresses);
    if (!inbound || isMachineMail(inbound.from, inbound.subject)) continue;

    const question = cleanEmailContent(
      inbound.body,
      inbound.htmlBody,
      QA_EXTRACTION.PAIR_PREVIEW_CHARS,
    );
    const replyText = cleanEmailContent(
      reply.body,
      reply.htmlBody,
      QA_EXTRACTION.PAIR_PREVIEW_CHARS,
    );
    if (!looksLikeQuestion(question)) continue;
    if (countWords(replyText) < QA_EXTRACTION.MIN_REPLY_WORDS) continue;

    const askerAddress = extractEmailAddress(inbound.from);
    usedThreads.add(reply.threadId);
    pairs.push({
      id: pairs.length + 1,
      askerAddress,
      askerLabel: labelAsker(askerAddress, labelByAddress),
      subject: inbound.subject,
      question,
      reply: replyText,
    });
  }
  return pairs;
}

export function countDistinctAskers(pairs: QaCandidatePair[]): number {
  return new Set(pairs.map((pair) => pair.askerAddress)).size;
}

/** The text block the extract-common-questions prompt receives as `pairsText`. */
export function formatQaPairsForPrompt(pairs: QaCandidatePair[]): string {
  return pairs
    .map((pair) =>
      [
        `[${pair.id}] Asked by: ${pair.askerLabel}`,
        `Subject: ${pair.subject}`,
        `Question: ${pair.question}`,
        `User's reply: ${pair.reply}`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function isWellFormedCluster(cluster: ExtractedQaCluster): boolean {
  const question = cluster.question.trim();
  const answer = cluster.answer.trim();
  return (
    question.endsWith(QUESTION_MARK) &&
    question.length <= QA_EXTRACTION.MAX_QUESTION_CHARS &&
    answer.length > 0 &&
    answer.length <= QA_EXTRACTION.MAX_ANSWER_CHARS &&
    cluster.confidence >= QA_EXTRACTION.MIN_CONFIDENCE
  );
}

function extractFacts(text: string): string[] {
  return (text.match(VERIFIABLE_FACT) ?? []).map((fact) =>
    fact.toLowerCase().replace(TRAILING_PUNCTUATION, ""),
  );
}

/**
 * True when every link, address and number in the answer appears in one of
 * the user's own replies. The auto-responder sends learned answers to real
 * people, so a price or link the model made up must never get through.
 */
export function isAnswerGroundedInReplies(
  answer: string,
  replies: string[],
): boolean {
  const statedFacts = new Set(replies.flatMap(extractFacts));
  return extractFacts(answer).every((fact) => statedFacts.has(fact));
}

function findClusterPairs(
  cluster: ExtractedQaCluster,
  pairById: Map<number, QaCandidatePair>,
): QaCandidatePair[] {
  return [...new Set(cluster.pairIds)]
    .map((pairId) => pairById.get(pairId))
    .filter((pair): pair is QaCandidatePair => Boolean(pair));
}

/**
 * Quality gate on the model's proposals. The repeat count comes from our own
 * data, never from the model: a cluster survives only if its pairs exist, were
 * asked by at least MIN_DISTINCT_ASKERS different people, and its answer
 * states no fact those people were not actually told.
 */
export function verifyQaClusters(
  clusters: ExtractedQaCluster[],
  pairs: QaCandidatePair[],
): VerifiedFaq[] {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const verified: VerifiedFaq[] = [];
  for (const cluster of clusters) {
    if (!isWellFormedCluster(cluster)) continue;
    const clusterPairs = findClusterPairs(cluster, pairById);
    const askerCount = countDistinctAskers(clusterPairs);
    if (askerCount < QA_EXTRACTION.MIN_DISTINCT_ASKERS) continue;
    const replies = clusterPairs.map((pair) => pair.reply);
    if (!isAnswerGroundedInReplies(cluster.answer, replies)) continue;
    verified.push({
      question: cluster.question.trim(),
      answer: cluster.answer.trim(),
      askerCount,
    });
  }
  return verified.sort((first, second) => second.askerCount - first.askerCount);
}
