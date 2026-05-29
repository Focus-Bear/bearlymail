import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
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
  constructor(
    private readonly contactsDebugAdminService: ContactsDebugAdminService,
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
}
