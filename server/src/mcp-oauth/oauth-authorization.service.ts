import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, MoreThan, Repository } from "typeorm";

import { AuditService } from "../audit/audit.service";
import {
  MCP_OAUTH,
  OAUTH_CLIENT_KINDS,
  OAUTH_ERROR_CODES,
} from "../constants/mcp-oauth.constants";
import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { OAuthAuthorizationCode } from "../database/entities/oauth-authorization-code.entity";
import { PersonalAccessTokensService } from "../personal-access-tokens/personal-access-tokens.service";
import {
  generateTokenSecret,
  hashTokenSecret,
} from "../personal-access-tokens/token-secrets";
import { resolveFrontendBaseUrl } from "../utils/frontend-base-url.util";
import { isClientMetadataDocumentUrl } from "./client-metadata-document";
import {
  mcpResourceUrl,
  normaliseResourceUri,
  oauthIssuerUrl,
} from "./mcp-oauth-urls";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";
import { OAuthError } from "./oauth-error";
import { buildAuthorizationRedirect, readSingleParam } from "./oauth-params";
import { parseRequestedScopes, resolveGrantedScopes } from "./oauth-scopes";
import {
  isLoopbackRedirectUri,
  matchesRegisteredRedirectUri,
  redirectUriHost,
} from "./redirect-uri-policy";

/** What the consent screen shows about a pending request. */
export interface ConsentRequestView {
  id: string;
  clientName: string;
  clientId: string;
  /** Host that published the client's metadata document, when it used one. */
  clientHost: string | null;
  /** Where the authorization code will be sent. */
  redirectHost: string;
  /** Any local process can claim a loopback redirect, so the page warns. */
  isLoopbackRedirect: boolean;
  canRequestSend: boolean;
  expiresAt: Date;
}

export interface ConsentDecision {
  approve: boolean;
  allowSend: boolean;
}

export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Host the Settings list and consent screen name a client by. */
export function clientDisplayHost(
  clientId: string,
  redirectUri: string,
): string {
  return isClientMetadataDocumentUrl(clientId)
    ? new URL(clientId).hostname
    : redirectUriHost(redirectUri);
}

/**
 * The front half of the authorization-code flow: validates `/oauth/authorize`,
 * parks the request for the consent screen (which runs in the web app, behind
 * the normal session login) and turns the user's answer into a redirect that
 * carries an authorization code or `access_denied`.
 */
@Injectable()
export class OAuthAuthorizationService {
  constructor(
    @InjectRepository(OAuthAuthorizationCode)
    private readonly codeRepository: Repository<OAuthAuthorizationCode>,
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly tokensService: PersonalAccessTokensService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Returns where to send the browser: the consent page, or (for an error
   * once the redirect URI is trusted) back to the client. Throws OAuthError
   * when the client or redirect URI can't be trusted, which must not redirect.
   */
  async beginAuthorization(
    params: Record<string, unknown>,
    now: Date = new Date(),
  ): Promise<string> {
    const client = await this.clientRegistry.resolve(
      readSingleParam(params, "client_id") ?? "",
      now,
    );
    const redirectUri = readSingleParam(params, "redirect_uri");
    if (
      !redirectUri ||
      !matchesRegisteredRedirectUri(redirectUri, client.redirectUris)
    ) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_REQUEST,
        "redirect_uri is not registered for this client",
      );
    }
    const state = readSingleParam(params, "state") ?? null;
    try {
      const request = this.validateRequest(params, state);
      const saved = await this.codeRepository.save(
        this.codeRepository.create({
          clientId: client.clientId,
          clientName: client.clientName,
          redirectUri,
          state,
          codeChallenge: request.codeChallenge,
          requestedScopes: request.scopes,
          expiresAt: new Date(
            now.getTime() + MCP_OAUTH.AUTHORIZATION_REQUEST_TTL_MS,
          ),
        }),
      );
      await this.pruneStaleRequests(now);
      const consentUrl = new URL(
        `${resolveFrontendBaseUrl()}${MCP_OAUTH.CONSENT_PAGE_PATH}`,
      );
      consentUrl.searchParams.set(MCP_OAUTH.CONSENT_REQUEST_PARAM, saved.id);
      return consentUrl.toString();
    } catch (error: unknown) {
      if (!(error instanceof OAuthError)) throw error;
      return buildAuthorizationRedirect(redirectUri, {
        error: error.code,
        error_description: error.description,
        state,
        iss: oauthIssuerUrl(),
      });
    }
  }

  async getConsentRequest(
    requestId: string,
    now: Date = new Date(),
  ): Promise<ConsentRequestView> {
    const row = await this.findPendingRequest(requestId, now);
    const isMetadataClient = isClientMetadataDocumentUrl(row.clientId);
    return {
      id: row.id,
      clientName: row.clientName,
      clientId: row.clientId,
      clientHost: isMetadataClient ? new URL(row.clientId).hostname : null,
      redirectHost: redirectUriHost(row.redirectUri),
      isLoopbackRedirect: isLoopbackRedirectUri(row.redirectUri),
      canRequestSend: row.requestedScopes.includes(PAT_SCOPES.MAIL_SEND),
      expiresAt: row.expiresAt,
    };
  }

  /** Records the user's answer and returns the redirect back to the client. */
  async decide(
    userId: string,
    requestId: string,
    decision: ConsentDecision,
    audit: AuditRequestContext,
    now: Date = new Date(),
  ): Promise<string> {
    const row = await this.findPendingRequest(requestId, now);
    const redirectBase = { state: row.state, iss: oauthIssuerUrl() };
    if (!decision.approve) {
      await this.claimRequest(row.id, { userId, consumedAt: now });
      await this.audit(userId, row, MCP_OAUTH.AUDIT_ACTIONS.DENIED, audit, {});
      return buildAuthorizationRedirect(row.redirectUri, {
        ...redirectBase,
        error: OAUTH_ERROR_CODES.ACCESS_DENIED,
        error_description: "The user declined access",
      });
    }

    await this.tokensService.assertBelowTokenLimit(userId, now);
    const grantedScopes = resolveGrantedScopes(
      row.requestedScopes,
      decision.allowSend,
    );
    const code = generateTokenSecret(MCP_OAUTH.AUTHORIZATION_CODE_PREFIX);
    await this.claimRequest(row.id, {
      userId,
      grantedScopes,
      codeHash: hashTokenSecret(code),
      codeExpiresAt: new Date(
        now.getTime() + MCP_OAUTH.AUTHORIZATION_CODE_TTL_MS,
      ),
    });
    await this.audit(userId, row, MCP_OAUTH.AUDIT_ACTIONS.GRANTED, audit, {
      scopes: grantedScopes,
    });
    return buildAuthorizationRedirect(row.redirectUri, {
      ...redirectBase,
      code,
    });
  }

  private validateRequest(
    params: Record<string, unknown>,
    state: string | null,
  ): { codeChallenge: string; scopes: string[] } {
    if (
      readSingleParam(params, "response_type") !== MCP_OAUTH.RESPONSE_TYPE_CODE
    ) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.UNSUPPORTED_RESPONSE_TYPE,
        'Only response_type "code" is supported',
      );
    }
    const codeChallenge = readSingleParam(params, "code_challenge");
    const method = readSingleParam(params, "code_challenge_method");
    if (
      !codeChallenge ||
      !MCP_OAUTH.CODE_CHALLENGE_PATTERN.test(codeChallenge) ||
      method !== MCP_OAUTH.CODE_CHALLENGE_METHOD_S256
    ) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_REQUEST,
        "A PKCE code_challenge with code_challenge_method S256 is required",
      );
    }
    if (state && state.length > MCP_OAUTH.MAX_STATE_LENGTH) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_REQUEST,
        "state is too long",
      );
    }
    assertResourceIsMcpServer(readSingleParam(params, "resource"));
    return {
      codeChallenge,
      scopes: parseRequestedScopes(readSingleParam(params, "scope")),
    };
  }

  private async findPendingRequest(
    requestId: string,
    now: Date,
  ): Promise<OAuthAuthorizationCode> {
    const row = await this.codeRepository.findOne({
      where: {
        id: requestId,
        userId: IsNull(),
        consumedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });
    if (!row) {
      throw new NotFoundException(
        "This sign-in request has expired or was already answered. Start again from Claude.",
      );
    }
    return row;
  }

  /** First answer wins: a second tab can't re-answer the same request. */
  private async claimRequest(
    requestId: string,
    changes: Partial<OAuthAuthorizationCode>,
  ): Promise<void> {
    const result = await this.codeRepository.update(
      { id: requestId, userId: IsNull(), consumedAt: IsNull() },
      changes,
    );
    if (!result.affected) {
      throw new NotFoundException("This sign-in request was already answered.");
    }
  }

  private async pruneStaleRequests(now: Date): Promise<void> {
    await this.codeRepository.delete({
      createdAt: LessThan(
        new Date(now.getTime() - MCP_OAUTH.AUTHORIZATION_ROW_RETENTION_MS),
      ),
    });
  }

  private audit(
    userId: string,
    row: OAuthAuthorizationCode,
    action: string,
    context: AuditRequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.log({
      userId,
      action,
      targetType: MCP_OAUTH.AUDIT_TARGET_TYPE,
      targetId: row.clientId,
      metadata: {
        clientName: row.clientName,
        redirectHost: redirectUriHost(row.redirectUri),
        clientKind: isClientMetadataDocumentUrl(row.clientId)
          ? OAUTH_CLIENT_KINDS.METADATA_DOCUMENT
          : OAUTH_CLIENT_KINDS.DYNAMIC,
        ...metadata,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}

/**
 * RFC 8707: a token may only be requested for this MCP server. Omitting the
 * parameter is tolerated for older clients; the token is still only valid here.
 */
export function assertResourceIsMcpServer(resource: string | undefined): void {
  if (resource === undefined) return;
  if (
    normaliseResourceUri(resource) !== normaliseResourceUri(mcpResourceUrl())
  ) {
    throw new OAuthError(
      OAUTH_ERROR_CODES.INVALID_TARGET,
      `resource must be ${mcpResourceUrl()}`,
    );
  }
}
