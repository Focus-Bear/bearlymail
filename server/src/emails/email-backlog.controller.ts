import { Controller, Get, Request, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EmailBacklogService } from "./email-backlog.service";

@Controller("emails")
@UseGuards(JwtAuthGuard)
export class EmailBacklogController {
  constructor(private readonly emailBacklogService: EmailBacklogService) {}

  @Get("backlog-progress")
  async getBacklogProgress(@Request() req) {
    return this.emailBacklogService.getBacklogProgress(req.user.userId);
  }
}
