import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { EmailProviderRequiredGuard } from "../../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { UnsubscribeEmailDto } from "../dto/unsubscribe-email.dto";
import {
  ArchiveSenderResult,
  EmailUnsubscribeService,
  UnsubscribeResult,
} from "./email-unsubscribe.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class EmailUnsubscribeController {
  constructor(
    private readonly emailUnsubscribeService: EmailUnsubscribeService,
  ) {}

  /**
   * POST /emails/:id/unsubscribe — one-click POST or mailto send, or the
   * sender's page for the client to open. Called only after the user confirms.
   */
  @Post(":id/unsubscribe")
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @Request() req,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UnsubscribeEmailDto,
  ): Promise<UnsubscribeResult> {
    return this.emailUnsubscribeService.unsubscribe(
      req.user.userId,
      id,
      dto.method,
    );
  }

  /**
   * POST /emails/:id/unsubscribe/archive-sender — after unsubscribing, archive
   * the sender's other Triage threads and auto-archive anything they still send.
   */
  @Post(":id/unsubscribe/archive-sender")
  @HttpCode(HttpStatus.OK)
  async archiveSender(
    @Request() req,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<ArchiveSenderResult> {
    return this.emailUnsubscribeService.archiveSender(req.user.userId, id);
  }
}
