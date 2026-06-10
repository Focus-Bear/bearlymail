import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { EmailProviderManager } from "./email-provider-manager.service";
import {
  EnrichedSearchResult,
  EnrichmentJob,
  EnrichmentStatusResponse,
  GmailSearchResult,
} from "./email-search.types";

/**
 * Background enrichment service for the instant Gmail search feature.
 *
 * Phase 1 (fast path): the controller returns metadata-only GmailSearchResults
 * immediately (< 500 ms).  It kicks off an enrichment job here in the background.
 *
 * Phase 2 (background): this service syncs the full message bodies + AI priority
 * scores for each messageId.  The frontend polls
 * GET /emails/search/enrichment/:jobId to merge results in-place.
 *
 * NOTE: Jobs are stored in-memory.  This is intentional for now — BearlyMail runs
 * single-instance, so in-memory is sufficient.
 * TODO: Migrate to Redis if/when multi-instance deployments are needed.
 */
@Injectable()
export class SearchEnrichmentService {
  private readonly logger = new Logger(SearchEnrichmentService.name);

  /**
   * In-memory job store.
   * Key: jobId (UUID)
   */
  private readonly jobs = new Map<string, EnrichmentJob>();

  /** Auto-cleanup delay after a job completes (5 minutes). */
  private static readonly JOB_TTL_MS = 5 * MILLISECONDS.MINUTE;

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * Start a background enrichment job for the given message IDs.
   * Returns immediately with a jobId the frontend can poll.
   */
  async startEnrichmentJob(
    userId: string,
    metadataResults: GmailSearchResult[],
  ): Promise<string> {
    const jobId = randomUUID();
    const messageIds = metadataResults.map((result) => result.messageId);
    const threadIds = [
      ...new Set(metadataResults.map((result) => result.threadId)),
    ];

    // Build a map of threadId -> messageIds so we can update progress per-thread
    // after each individual thread sync completes (incremental progress reporting).
    const messageIdsByThread = new Map<string, string[]>();
    for (const result of metadataResults) {
      const existing = messageIdsByThread.get(result.threadId) ?? [];
      existing.push(result.messageId);
      messageIdsByThread.set(result.threadId, existing);
    }

    const job: EnrichmentJob = {
      id: jobId,
      userId,
      messageIds,
      status: "in-progress",
      enrichedResults: [],
      progress: { total: messageIds.length, enriched: 0, failed: 0 },
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // Fire-and-forget — intentionally not awaited
    this.processEnrichment(job, threadIds, messageIdsByThread).catch((err) => {
      this.logger.error(`Enrichment job ${jobId} crashed:`, err);
      job.status = "failed";
      // Schedule TTL cleanup even on crash so the job doesn't leak memory indefinitely.
      setTimeout(
        () => this.jobs.delete(job.id),
        SearchEnrichmentService.JOB_TTL_MS,
      );
    });

    return jobId;
  }

  /**
   * Return the current status of an enrichment job for a given user.
   *
   * Returns null if the job doesn't exist OR if the requesting user doesn't
   * own the job (callers must treat null as Not Found to avoid leaking job
   * existence to other users).
   *
   * All enriched results accumulated so far are always returned on every poll.
   * The client-side merge is idempotent (Map keyed by messageId), so returning
   * duplicates on re-poll is safe.  This eliminates the entire class of
   * "cursor advances before ACK" bugs where a network blip could permanently
   * drop results that were never received by the client.
   */
  getStatus(
    jobId: string,
    requestingUserId: string,
  ): EnrichmentStatusResponse | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    // Security: only the job owner may read its status
    if (job.userId !== requestingUserId) return null;

    return {
      jobId: job.id,
      status: job.status,
      progress: { ...job.progress },
      // Always return all enriched results — no cursor advancement.
      // The 5-min TTL handles cleanup; the client Map merge handles duplicates.
      enrichedResults: [...job.enrichedResults],
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Process enrichment for a job by syncing threads individually and updating
   * progress.enriched after each thread completes.
   *
   * Threads are synced one at a time (not as a batch) so the frontend sees
   * incremental progress updates — e.g. 5/20, 10/20, 15/20 — instead of jumping
   * straight from 0/n to n/n when the batch completes all at once.
   *
   * @param messageIdsByThread - maps threadId → [messageId, ...] for progress tracking.
   *        Invariant: every messageId in job.messageIds appears in exactly one thread bucket.
   */
  private async processEnrichment(
    job: EnrichmentJob,
    threadIds: string[],
    messageIdsByThread: Map<string, string[]>,
  ): Promise<void> {
    const { userId } = job;

    // Resolve the provider once (it doesn't change across threads).
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);

    // Track which messageIds have been accounted for (enriched or failed).
    const settledMessageIds = new Set<string>();

    for (const threadId of threadIds) {
      // Sync this thread individually so that DB state is available for the
      // messageIds query below before we move on to the next thread.
      if (provider) {
        try {
          await provider.syncEmails(userId, {
            threadIds: [threadId],
            isContinuation: true,
          });
        } catch (syncError) {
          this.logger.warn(
            `[Enrichment ${job.id}] Sync failed for thread ${threadId}:`,
            syncError,
          );
          // Even on sync failure, fall through to the DB query —
          // the email may already be in the DB from a prior sync.
        }
      }

      // Check which messageIds from this thread are now in the DB.
      const threadMessageIds = (messageIdsByThread.get(threadId) ?? []).filter(
        (mid) => !settledMessageIds.has(mid),
      );

      if (threadMessageIds.length === 0) continue;

      // Re-query DB for all synced emails, including the thread relation so
      // toEnrichedResult can read starCount and priorityScore without any-casts.
      const dbEmails = await this.emailRepository.find({
        where: { userId, messageId: In(threadMessageIds) },
        relations: {
          thread: true,
        },
      });
      const dbMap = new Map(dbEmails.map((email) => [email.messageId, email]));

      for (const messageId of threadMessageIds) {
        settledMessageIds.add(messageId);
        const dbEmail = dbMap.get(messageId);
        if (dbEmail != null) {
          // Ensure encrypted fields are decrypted — toEnrichedResult reads body/subject/from.
          decryptEmailEntityForApi(dbEmail);
          job.enrichedResults.push(toEnrichedResult(dbEmail));
          job.progress.enriched++;
        } else {
          job.progress.failed++;
          this.logger.debug(
            `[Enrichment ${job.id}] messageId ${messageId} not found in DB after sync`,
          );
        }
      }
    }

    // Catch any messageIds not covered by any thread bucket (edge case — should
    // never happen if messageIdsByThread was built correctly, but defensive).
    for (const messageId of job.messageIds) {
      if (!settledMessageIds.has(messageId)) {
        job.progress.failed++;
        this.logger.debug(
          `[Enrichment ${job.id}] messageId ${messageId} not covered by any thread`,
        );
      }
    }

    job.status = "complete";

    // Auto-cleanup after TTL
    setTimeout(
      () => this.jobs.delete(job.id),
      SearchEnrichmentService.JOB_TTL_MS,
    );
  }
}

/**
 * Convert a DB Email entity to an EnrichedSearchResult.
 * Keeps the shape compatible with GmailSearchResult so the frontend can merge in-place.
 *
 * Note: starCount and priorityScore live on EmailThread, not Email.
 * When the email entity has its thread relation loaded they will be present via
 * `email.thread`; otherwise they fall back to undefined.
 */
/** Maximum number of characters for the email snippet shown in search results. */
const SNIPPET_MAX_CHARS = 120;

function toEnrichedResult(
  email: Email & { thread?: EmailThread },
): EnrichedSearchResult {
  const { thread } = email;

  return {
    // GmailSearchResult fields
    messageId: email.messageId ?? email.id,
    threadId: email.threadId ?? "",
    subject: email.subject ?? "(No Subject)",
    from: email.from ?? "",
    fromName: email.fromName ?? undefined,
    date: email.receivedAt
      ? new Date(email.receivedAt).toISOString()
      : new Date().toISOString(),
    snippet: email.body ? email.body.slice(0, SNIPPET_MAX_CHARS) : "",
    isRead: email.isRead ?? false,
    // labelIds are not persisted to the DB — omit rather than return a misleading empty array.
    // Gmail label data (INBOX, UNREAD, etc.) is only available during the live API fetch;
    // it is not stored on the Email entity. If label-based filtering is needed in future,
    // add a labels column to the Email entity and populate it during sync.
    labelIds: [],
    enrichmentStatus: "enriched",

    // Enriched-only fields
    id: email.id,
    body: email.body ?? "",
    htmlBody: email.htmlBody ?? undefined,
    attachments: email.attachments ?? undefined,
    starCount: thread?.starCount ?? undefined,
    priorityScore: thread?.priorityScore ?? null,
  };
}
