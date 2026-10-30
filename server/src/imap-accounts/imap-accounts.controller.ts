import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StepUpAuthGuard } from "../auth/step-up.guard";
import { MILLISECONDS } from "../constants/time-constants";
import { AuthenticatedRequest } from "../types/common";
import { ImapAccountSettingsDto } from "./dto/imap-account-settings.dto";
import { ImapAccountsService } from "./imap-accounts.service";

/**
 * Each test/connect opens outbound IMAP + SMTP logins, so they're throttled
 * hard: this stops the endpoint being used to brute-force mail passwords.
 */
const CONNECTION_ATTEMPT_LIMIT = {
  default: { limit: 10, ttl: MILLISECONDS.MINUTE * 10 },
};

@Controller("imap-accounts")
@UseGuards(JwtAuthGuard)
export class ImapAccountsController {
  constructor(private readonly imapAccountsService: ImapAccountsService) {}

  @Post("test")
  @HttpCode(HttpStatus.OK)
  @Throttle(CONNECTION_ATTEMPT_LIMIT)
  test(@Body() dto: ImapAccountSettingsDto) {
    return this.imapAccountsService.testConnection(dto);
  }

  @Post("connect")
  @Throttle(CONNECTION_ATTEMPT_LIMIT)
  async connect(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImapAccountSettingsDto,
  ) {
    const account = await this.imapAccountsService.connect(
      req.user.userId,
      dto,
    );
    return { account };
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.imapAccountsService.listSummaries(req.user.userId);
  }

  @Post(":id/set-primary")
  setPrimary(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.imapAccountsService.setPrimary(id, req.user.userId);
  }

  @Delete(":id")
  @UseGuards(StepUpAuthGuard)
  async disconnect(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.imapAccountsService.disconnect(id, req.user.userId);
    return { success: true };
  }
}
