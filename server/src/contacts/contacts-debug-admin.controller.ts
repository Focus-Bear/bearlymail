import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { JobPriority } from "../queue/job-priorities";
import { BackfillContactSearchTokensJobData } from "./contact-search-token-backfill.processor";
import {
  BackfillAllUsersResult,
  ContactsDebugAdminService,
  ContactSearchDebugResult,
  RebuildSearchTokensResult,
} from "./contacts-debug-admin.service";

/**
 * Admin-only diagnostics for `/contacts/search`. Exposes the internal token
 * generation, SQL candidate set, post-filter decisions, Gmail fallback
 * results, and a target-contact lookup so admins can see *exactly* why a
 * given contact does or doesn't surface in search.
 *
 * Lives in a separate controller from `ContactsController` so the admin
 * guard stack (JwtAuthGuard + AdminGuard) is unambiguous and so the public
 * controller stays focused on user-facing endpoints.
 */
@Controller("contacts/admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ContactsDebugAdminController {
  private readonly logger = new Logger(ContactsDebugAdminController.name);

  constructor(
    private readonly contactsDebugAdminService: ContactsDebugAdminService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * Dumps the full anatomy of a contact search for the calling admin's own
   * userId. Cross-user inspection is intentionally not supported here —
   * per-user KMS keys are pinned to the request's authenticated user, so
   * decrypting another user's `email`/`name` fields in this request context
   * would fail anyway.
   */
  @Get("search-debug")
  async searchDebug(
    @Request() req: { user: { userId: string } },
    @Query("q") query: string,
    @Query("targetEmail") targetEmail?: string,
  ): Promise<ContactSearchDebugResult> {
    const trimmedQuery = (query || "").trim();
    if (!trimmedQuery) {
      // Without a query, `generateQueryTokens` returns [] and the post-filter
      // would trivially fail on every row — the diagnostic has nothing to say.
      throw new BadRequestException("Query parameter 'q' is required");
    }
    const trimmedTarget = targetEmail?.trim() || undefined;
    return this.contactsDebugAdminService.diagnoseSearch(
      req.user.userId,
      trimmedQuery,
      trimmedTarget,
    );
  }

  /**
   * Regenerates the blind-index `searchTokens` for the caller's contacts that
   * currently have NULL or empty values — the most common cause of "contact is
   * in the DB but search misses it". Pass `contactId` to fix one row at a time
   * (e.g. via the target-contact diagnostic card); omit it to backfill in
   * `REBUILD_BATCH_SIZE`-sized passes.
   */
  @Post("rebuild-search-tokens")
  async rebuildSearchTokens(
    @Request() req: { user: { userId: string } },
    @Body() body: { contactId?: string },
  ): Promise<RebuildSearchTokensResult> {
    const contactId = body?.contactId?.trim() || undefined;
    return this.contactsDebugAdminService.rebuildSearchTokens(req.user.userId, {
      contactId,
    });
  }

  /**
   * Enqueue the all-users `searchTokens` backfill (#2030). Unlike
   * `rebuild-search-tokens` (the caller's own contacts only, synchronous), this
   * fans across every user with NULL/empty tokens. It runs as a single
   * background job — each user is re-encryption-key-scoped inside the worker —
   * so the request returns a jobId immediately rather than holding the ALB
   * connection for a multi-user scan. Poll
   * `GET /contacts/admin/backfill-search-tokens/job/:jobId` for the summary.
   */
  @Post("backfill-search-tokens/start")
  async startBackfillSearchTokens(@Body() body: { dryRun?: boolean } = {}) {
    const dryRun = body?.dryRun ?? false;
    const jobData: BackfillContactSearchTokensJobData = { dryRun };
    // Generous expiry: a one-time backfill over a large contact set can exceed
    // the 15-min default. Idempotent, so a retry on expiry resumes cleanly.
    const jobId = await this.boss.send(
      JOB_NAMES.BACKFILL_CONTACT_SEARCH_TOKENS,
      jobData,
      { priority: JobPriority.LOW, expireInSeconds: SECONDS.SIX_HOURS },
    );
    this.logger.log(
      `Enqueued contact searchTokens backfill job ${jobId}${dryRun ? " (dry run)" : ""}`,
    );
    return { jobId, dryRun };
  }

  /**
   * Poll a backfill job's state and (on completion) its persisted summary.
   * Returns `state: "not_found"` once PgBoss prunes the completed job.
   */
  @Get("backfill-search-tokens/job/:jobId")
  async getBackfillSearchTokensJob(@Param("jobId") jobId: string) {
    const job = await this.boss.getJobById(
      JOB_NAMES.BACKFILL_CONTACT_SEARCH_TOKENS,
      jobId,
    );
    if (!job) {
      return { state: "not_found" as const, output: null };
    }
    return {
      state: job.state,
      output: (job.output as BackfillAllUsersResult | null) ?? null,
      createdOn: job.createdOn,
      completedOn: job.completedOn,
    };
  }
}
