import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { EmailAccountRequiredGuard } from "../auth/gmail-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EmailsService } from "./emails.service";
import { GmailSyncService } from "./providers/gmail-sync.service";

/**
 * EmailDebugController
 *
 * Houses only the debug endpoints that are UNIQUE to this controller
 * (not already handled by EmailDebugAdminController).
 *
 * Currently unique routes:
 *   GET  /emails/debug/priority-info              — priority bucket counts & histogram
 *   POST /emails/:id/debug/refresh-attachments-from-gmail — refresh Gmail attachments
 *
 * All other /emails/debug/* routes are handled by EmailDebugAdminController.
 * See issue #1699 for context.
 */
@Controller("emails")
@UseGuards(JwtAuthGuard, EmailAccountRequiredGuard, AdminGuard)
export class EmailDebugController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly gmailSyncService: GmailSyncService,
  ) {}

  /**
   * Priority debug info endpoint.
   * Returns per-mode bucket counts, priority score histogram, and fetch timestamp.
   */
  @Get("debug/priority-info")
  async getPriorityDebugInfo(@Request() req) {
    return this.emailsService.getPriorityDebugInfo(req.user.userId);
  }

  @Post(":id/debug/refresh-attachments-from-gmail")
  async refreshAttachmentsFromGmail(@Request() req, @Param("id") id: string) {
    // Process entire thread, not just the single email
    return this.gmailSyncService.refreshAttachmentsFromGmailForThread(
      req.user.userId,
      id,
    );
  }
}
