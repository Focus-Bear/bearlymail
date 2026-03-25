/**
 * EmailSearchOpsController
 *
 * Handles the secondary search operations: ranking and expansion.
 * The primary /emails/search GET endpoint remains in EmailsController.
 *
 * Extracted from emails.controller.ts (issue #1460) to keep that file
 * under the 800-line lint budget.
 */

import {
  Body,
  Controller,
  Logger,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { GmailRequiredGuard } from "../auth/gmail-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EMAIL_CONTROLLER_DEFAULTS } from "./email-controller.helpers";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, GmailRequiredGuard)
export class EmailSearchOpsController {
  private readonly logger = new Logger(EmailSearchOpsController.name);

  constructor(private readonly emailsService: EmailsService) {}

  @Post("search/rank")
  async rankSearchResults(
    @Request() req,
    @Body() body: { emailIds: string[]; query: string; maxResults?: number },
  ) {
    const { emailIds, query, maxResults } = body;
    if (!query || !emailIds || emailIds.length === 0) {
      return [];
    }
    try {
      return await this.emailsService.rankSearchResults(
        req.user.userId,
        query,
        emailIds,
        maxResults ?? EMAIL_CONTROLLER_DEFAULTS.MAX_RESULTS,
      );
    } catch (error) {
      this.logger.error(`Error in rankSearchResults:`, error);
      return [];
    }
  }

  @Post("search/expand")
  async expandSearchResults(
    @Request() req,
    @Body() body: { query: string; existingEmailIds: string[] },
  ) {
    const { query, existingEmailIds } = body;
    if (!query) {
      return [];
    }
    try {
      return await this.emailsService.expandSearchResults(
        req.user.userId,
        query,
        existingEmailIds ?? [],
      );
    } catch (error) {
      this.logger.error(`Error in expandSearchResults:`, error);
      return [];
    }
  }
}
