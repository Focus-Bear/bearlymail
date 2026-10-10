import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BulkSnoozeResult, SnoozeService } from "./snooze.service";

@Controller("snooze")
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  constructor(private readonly snoozeService: SnoozeService) {}

  // Declared before @Post(":id") so "bulk" is not matched as an email id.
  @Post("bulk")
  async bulkSnoozeEmails(
    @Request() req,
    @Body() body: { emailIds: string[]; duration: string; locale?: string },
  ): Promise<BulkSnoozeResult> {
    return this.snoozeService.bulkSnoozeEmails(
      req.user.userId,
      body.emailIds,
      body.duration,
      body.locale,
    );
  }

  @Post(":id")
  async snoozeEmail(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { duration: string; locale?: string },
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date }> {
    return this.snoozeService.snoozeEmail(
      req.user.userId,
      id,
      body.duration,
      body.locale,
    );
  }

  @Delete(":id")
  async unsnoozeEmail(
    @Request() req,
    @Param("id") id: string,
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date | null }> {
    return this.snoozeService.unsnoozeEmail(req.user.userId, id);
  }
}
