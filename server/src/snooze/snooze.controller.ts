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
import { SnoozeService } from "./snooze.service";

@Controller("snooze")
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  constructor(private readonly snoozeService: SnoozeService) {}

  @Post(":id")
  async snoozeEmail(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { duration: string },
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date }> {
    return this.snoozeService.snoozeEmail(req.user.userId, id, body.duration);
  }

  @Delete(":id")
  async unsnoozeEmail(
    @Request() req,
    @Param("id") id: string,
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date | null }> {
    return this.snoozeService.unsnoozeEmail(req.user.userId, id);
  }
}
