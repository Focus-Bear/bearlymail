import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ConsentDecisionDto } from "./dto/consent-decision.dto";
import {
  ConsentRequestView,
  OAuthAuthorizationService,
} from "./oauth-authorization.service";

interface JwtRequest {
  user: { userId: string };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Backs the web app's consent screen. Session (JWT) auth: the user approving
 * is whoever is logged in to BearlyMail, and the SameSite=Strict session
 * cookie means another site can't submit a decision on their behalf.
 */
@Controller("oauth/consent-requests")
@UseGuards(JwtAuthGuard)
export class OAuthConsentController {
  constructor(
    private readonly authorizationService: OAuthAuthorizationService,
  ) {}

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<ConsentRequestView> {
    return this.authorizationService.getConsentRequest(id);
  }

  /** Returns the URL to send the browser to (the client's redirect URI). */
  @Post(":id/decision")
  @HttpCode(HttpStatus.OK)
  async decide(
    @Request() req: JwtRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ConsentDecisionDto,
  ): Promise<{ redirectUrl: string }> {
    const userAgent = req.headers["user-agent"];
    const redirectUrl = await this.authorizationService.decide(
      req.user.userId,
      id,
      body,
      {
        ipAddress: req.ip ?? null,
        userAgent: typeof userAgent === "string" ? userAgent : null,
      },
    );
    return { redirectUrl };
  }
}
