import { Controller, Post, Request, UseGuards } from "@nestjs/common";

import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import {
  ImportOlderEmailsResult,
  ImportOlderEmailsService,
} from "./import-older-emails.service";

/**
 * "Process another 500": imports the next batch of older inbox mail. Behind the AI-capacity
 * guard because every imported email is processed by the AI and charged to the plan.
 */
@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class ImportOlderEmailsController {
  constructor(
    private readonly importOlderEmailsService: ImportOlderEmailsService,
  ) {}

  @Post("import-older")
  @UseGuards(AiCapacityGuard)
  async importOlder(@Request() req): Promise<ImportOlderEmailsResult> {
    return this.importOlderEmailsService.importNextBatch(req.user.userId);
  }
}
