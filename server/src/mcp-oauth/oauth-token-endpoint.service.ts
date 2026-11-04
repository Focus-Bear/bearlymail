import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuditService } from "../audit/audit.service";
import { MCP_OAUTH, OAUTH_ERROR_CODES } from "../constants/mcp-oauth.constants";
import { OAuthAuthorizationCode } from "../database/entities/oauth-authorization-code.entity";
import {
  OAuthGrantsService,
  OAuthTokenSet,
} from "../personal-access-tokens/oauth-grants.service";
import { isPatScope } from "../personal-access-tokens/personal-access-tokens.service";
import { hashTokenSecret } from "../personal-access-tokens/token-secrets";
import {
  assertResourceIsMcpServer,
  clientDisplayHost,
} from "./oauth-authorization.service";
import { OAuthError } from "./oauth-error";
import { readSingleParam, requireParam } from "./oauth-params";
import { isValidPkceVerifier } from "./pkce";

/** RFC 6749 §5.1 successful token response. */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function toTokenResponse(tokens: OAuthTokenSet): OAuthTokenResponse {
  return {
    access_token: tokens.accessToken,
    token_type: MCP_OAUTH.TOKEN_TYPE_BEARER,
    expires_in: tokens.expiresInSeconds,
    refresh_token: tokens.refreshToken,
    scope: tokens.scopes.join(" "),
  };
}

function invalidGrant(description: string): OAuthError {
  return new OAuthError(OAUTH_ERROR_CODES.INVALID_GRANT, description);
}

/**
 * `POST /oauth/token` (authorization_code + refresh_token grants, public
 * clients with PKCE) and `POST /oauth/revoke` (RFC 7009).
 */
@Injectable()
export class OAuthTokenEndpointService {
  private readonly logger = new Logger(OAuthTokenEndpointService.name);

  constructor(
    @InjectRepository(OAuthAuthorizationCode)
    private readonly codeRepository: Repository<OAuthAuthorizationCode>,
    private readonly grantsService: OAuthGrantsService,
    private readonly auditService: AuditService,
  ) {}

  async exchange(
    params: Record<string, unknown>,
    now: Date = new Date(),
  ): Promise<OAuthTokenResponse> {
    const grantType = requireParam(params, "grant_type");
    if (grantType === MCP_OAUTH.GRANT_TYPES.AUTHORIZATION_CODE) {
      return toTokenResponse(await this.redeemCode(params, now));
    }
    if (grantType === MCP_OAUTH.GRANT_TYPES.REFRESH_TOKEN) {
      return toTokenResponse(await this.refresh(params, now));
    }
    throw new OAuthError(
      OAUTH_ERROR_CODES.UNSUPPORTED_GRANT_TYPE,
      `Supported grant types: ${Object.values(MCP_OAUTH.GRANT_TYPES).join(", ")}`,
    );
  }

  /** RFC 7009: always succeeds, whether or not the token was live. */
  async revoke(
    params: Record<string, unknown>,
    now: Date = new Date(),
  ): Promise<void> {
    const token = requireParam(params, "token");
    const clientId = requireParam(params, "client_id");
    await this.grantsService.revokeBySecret(token, clientId, now);
  }

  private async redeemCode(
    params: Record<string, unknown>,
    now: Date,
  ): Promise<OAuthTokenSet> {
    const code = requireParam(params, "code");
    const clientId = requireParam(params, "client_id");
    const redirectUri = requireParam(params, "redirect_uri");
    const codeVerifier = requireParam(params, "code_verifier");
    assertResourceIsMcpServer(readSingleParam(params, "resource"));

    const row = code.startsWith(MCP_OAUTH.AUTHORIZATION_CODE_PREFIX)
      ? await this.codeRepository.findOne({
          where: { codeHash: hashTokenSecret(code) },
        })
      : null;
    if (!row || !row.userId || !row.grantedScopes || !row.codeExpiresAt) {
      throw invalidGrant("Unknown authorization code");
    }
    if (row.consumedAt) {
      await this.handleReplayedCode(row, now);
      throw invalidGrant("Authorization code was already used");
    }
    const isBoundToRequest =
      row.clientId === clientId &&
      row.redirectUri === redirectUri &&
      row.codeExpiresAt.getTime() > now.getTime();
    if (!isBoundToRequest) {
      throw invalidGrant(
        "Authorization code is expired or was issued to another client",
      );
    }
    if (!isValidPkceVerifier(codeVerifier, row.codeChallenge)) {
      throw invalidGrant("code_verifier does not match the code_challenge");
    }

    const consumed = await this.codeRepository.update(
      { id: row.id, consumedAt: IsNull() },
      { consumedAt: now },
    );
    if (!consumed.affected) {
      throw invalidGrant("Authorization code was already used");
    }
    const tokens = await this.grantsService.issue(
      {
        userId: row.userId,
        clientId: row.clientId,
        name: `${row.clientName} (${clientDisplayHost(row.clientId, row.redirectUri)})`,
        scopes: row.grantedScopes.filter(isPatScope),
      },
      now,
    );
    await this.codeRepository.update(
      { id: row.id },
      { issuedTokenId: tokens.tokenId },
    );
    return tokens;
  }

  private async refresh(
    params: Record<string, unknown>,
    now: Date,
  ): Promise<OAuthTokenSet> {
    const refreshToken = requireParam(params, "refresh_token");
    const clientId = requireParam(params, "client_id");
    assertResourceIsMcpServer(readSingleParam(params, "resource"));
    const tokens = await this.grantsService.refresh(
      refreshToken,
      clientId,
      now,
    );
    if (!tokens) {
      throw invalidGrant("Refresh token is invalid, expired or revoked");
    }
    return tokens;
  }

  /**
   * OAuth 2.1 §4.1.3: a code used twice suggests it leaked, so the connection
   * the first use produced is revoked too.
   */
  private async handleReplayedCode(
    row: OAuthAuthorizationCode,
    now: Date,
  ): Promise<void> {
    if (!row.issuedTokenId) return;
    await this.grantsService.revokeById(row.issuedTokenId, now);
    this.logger.warn(
      `Authorization code replayed for client ${row.clientId}; revoked connection ${row.issuedTokenId}`,
    );
    await this.auditService.log({
      userId: row.userId,
      action: MCP_OAUTH.AUDIT_ACTIONS.CODE_REPLAYED,
      targetType: MCP_OAUTH.AUDIT_TARGET_TYPE,
      targetId: row.clientId,
      metadata: { tokenId: row.issuedTokenId },
    });
  }
}
