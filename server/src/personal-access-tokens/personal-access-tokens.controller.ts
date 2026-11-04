import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PERSONAL_ACCESS_TOKENS } from "../constants/personal-access-tokens.constants";
import { CreatePersonalAccessTokenDto } from "./dto/create-personal-access-token.dto";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";

interface JwtRequest {
  user: { userId: string };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Settings endpoints for personal access tokens. Session (JWT) auth only: a
 * token can never be used to mint or revoke tokens.
 */
@Controller("personal-access-tokens")
@UseGuards(JwtAuthGuard)
export class PersonalAccessTokensController {
  constructor(
    private readonly tokensService: PersonalAccessTokensService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  list(@Request() req: JwtRequest) {
    return this.tokensService.list(req.user.userId);
  }

  @Post()
  async create(
    @Request() req: JwtRequest,
    @Body() body: CreatePersonalAccessTokenDto,
  ) {
    const created = await this.tokensService.create(req.user.userId, body);
    await this.audit(req, PERSONAL_ACCESS_TOKENS.AUDIT_ACTIONS.CREATED, {
      tokenId: created.summary.id,
      scopes: created.summary.scopes,
      expiresAt: created.summary.expiresAt,
    });
    return created;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Request() req: JwtRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.tokensService.revoke(req.user.userId, id);
    await this.audit(req, PERSONAL_ACCESS_TOKENS.AUDIT_ACTIONS.REVOKED, {
      tokenId: id,
    });
  }

  private audit(
    req: JwtRequest,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const userAgent = req.headers["user-agent"];
    return this.auditService.log({
      userId: req.user.userId,
      action,
      targetType: PERSONAL_ACCESS_TOKENS.AUDIT_TARGET_TYPE,
      targetId: String(metadata.tokenId),
      metadata,
      ipAddress: req.ip ?? null,
      userAgent: typeof userAgent === "string" ? userAgent : null,
    });
  }
}
