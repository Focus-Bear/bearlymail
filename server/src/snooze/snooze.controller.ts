import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { RequireGooglePermission } from "../auth/google-permission.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  GMAIL_WRITE_ACTION,
  GOOGLE_PERMISSION_GROUP,
} from "../constants/google-oauth-scopes";
import { BulkSnoozeResult, SnoozeService } from "./snooze.service";

interface SnoozeRequestBody {
  duration: string;
  locale?: string;
  /** ISO instant the client resolved `duration` to in the user's timezone. */
  snoozeUntil?: string;
}

@Controller("snooze")
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  constructor(private readonly snoozeService: SnoozeService) {}

  // Declared before @Post(":id") so "bulk" is not matched as an email id.
  @Post("bulk")
  @RequireGooglePermission(
    GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
    GMAIL_WRITE_ACTION.SNOOZE,
  )
  async bulkSnoozeEmails(
    @Request() req,
    @Body() body: SnoozeRequestBody & { emailIds: string[] },
  ): Promise<BulkSnoozeResult> {
    return this.snoozeService.bulkSnoozeEmails(
      req.user.userId,
      body.emailIds,
      body.duration,
      body.locale,
      body.snoozeUntil,
    );
  }

  @Post(":id")
  @RequireGooglePermission(
    GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
    GMAIL_WRITE_ACTION.SNOOZE,
  )
  async snoozeEmail(
    @Request() req,
    @Param("id") id: string,
    @Body() body: SnoozeRequestBody,
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date }> {
    return this.snoozeService.snoozeEmail(
      req.user.userId,
      id,
      body.duration,
      body.locale,
      body.snoozeUntil,
    );
  }

  // Not gated: without the grant the snooze never reached Gmail, so ending it
  // needs no Gmail write (GmailProvider skips it).
  @Delete(":id")
  async unsnoozeEmail(
    @Request() req,
    @Param("id") id: string,
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date | null }> {
    return this.snoozeService.unsnoozeEmail(req.user.userId, id);
  }
}
