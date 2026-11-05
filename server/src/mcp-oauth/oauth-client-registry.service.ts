import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "crypto";
import { Repository } from "typeorm";

import {
  MCP_OAUTH,
  OAUTH_CLIENT_KINDS,
  OAUTH_ERROR_CODES,
  OAuthClientKind,
} from "../constants/mcp-oauth.constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { OAuthClient } from "../database/entities/oauth-client.entity";
import { getErrorMessage } from "../types/common";
import {
  ClientMetadataError,
  fetchClientMetadataJson,
  isClientMetadataDocumentUrl,
  validateClientMetadataDocument,
} from "./client-metadata-document";
import { OAuthError } from "./oauth-error";
import { isRegistrableRedirectUri } from "./redirect-uri-policy";

const DYNAMIC_CLIENT_ID_PREFIX = "bm_client_";
const DYNAMIC_CLIENT_ID_RANDOM_BYTES = 16;
const DEFAULT_DYNAMIC_CLIENT_NAME = "MCP client";

/** A client the authorization server knows how to talk to. */
export interface ResolvedOAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  kind: OAuthClientKind;
}

/** RFC 7591 §3.2.1 registration response. */
export interface ClientRegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

interface CachedDocument {
  client: ResolvedOAuthClient;
  expiresAt: number;
}

function readRegistrationRequest(body: unknown): {
  clientName: string;
  redirectUris: string[];
} {
  const fields =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const redirectUris = fields.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MCP_OAUTH.MAX_REDIRECT_URIS ||
    !redirectUris.every(
      (uri) => typeof uri === "string" && isRegistrableRedirectUri(uri),
    )
  ) {
    throw new OAuthError(
      OAUTH_ERROR_CODES.INVALID_REDIRECT_URI,
      "redirect_uris must be HTTPS or loopback HTTP URLs",
    );
  }
  const rawName =
    typeof fields.client_name === "string" ? fields.client_name.trim() : "";
  return {
    clientName: (rawName || DEFAULT_DYNAMIC_CLIENT_NAME).slice(
      0,
      MCP_OAUTH.MAX_CLIENT_NAME_LENGTH,
    ),
    redirectUris: [...new Set(redirectUris as string[])],
  };
}

/**
 * Knows every OAuth client: those that identify with a Client ID Metadata
 * Document (fetched and cached briefly) and those registered dynamically.
 * Every client is public; PKCE replaces the client secret.
 */
@Injectable()
export class OAuthClientRegistryService {
  private readonly logger = new Logger(OAuthClientRegistryService.name);
  private readonly documentCache = new Map<string, CachedDocument>();

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepository: Repository<OAuthClient>,
  ) {}

  /** Resolves a client_id, or throws `invalid_client` (never redirects). */
  async resolve(
    clientId: string,
    now: Date = new Date(),
  ): Promise<ResolvedOAuthClient> {
    if (!clientId) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_REQUEST,
        "client_id is required",
      );
    }
    if (isClientMetadataDocumentUrl(clientId)) {
      return this.resolveMetadataDocument(clientId, now);
    }
    const row = await this.clientRepository.findOne({
      where: { id: clientId },
    });
    if (!row) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_CLIENT,
        "Unknown client_id",
        HttpStatus.UNAUTHORIZED,
      );
    }
    return {
      clientId: row.id,
      clientName: row.clientName,
      redirectUris: row.redirectUris,
      kind: OAUTH_CLIENT_KINDS.DYNAMIC,
    };
  }

  /** RFC 7591 dynamic client registration. Always registers a public client. */
  async register(body: unknown): Promise<ClientRegistrationResponse> {
    const { clientName, redirectUris } = readRegistrationRequest(body);
    const saved = await this.clientRepository.save(
      this.clientRepository.create({
        id:
          DYNAMIC_CLIENT_ID_PREFIX +
          randomBytes(DYNAMIC_CLIENT_ID_RANDOM_BYTES).toString("base64url"),
        clientName,
        redirectUris,
      }),
    );
    await this.pruneUnusedClients();
    return {
      client_id: saved.id,
      client_id_issued_at: Math.floor(
        saved.createdAt.getTime() / MS_PER_SECOND,
      ),
      client_name: saved.clientName,
      redirect_uris: saved.redirectUris,
      grant_types: Object.values(MCP_OAUTH.GRANT_TYPES),
      response_types: [MCP_OAUTH.RESPONSE_TYPE_CODE],
      token_endpoint_auth_method: MCP_OAUTH.TOKEN_ENDPOINT_AUTH_METHOD_NONE,
    };
  }

  /**
   * Registration needs no login, so old registrations are removed here rather
   * than left to pile up. A client that comes back simply registers again.
   * Best-effort: a failure must not fail the registration it runs after.
   */
  private async pruneUnusedClients(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(
      now.getTime() - MCP_OAUTH.UNUSED_CLIENT_RETENTION_MS,
    );
    try {
      await this.clientRepository.query(
        `DELETE FROM oauth_clients client
         WHERE client."createdAt" < $1
           AND NOT EXISTS (
             SELECT 1 FROM personal_access_tokens token
             WHERE token."oauthClientId" = client.id
               AND token."revokedAt" IS NULL
           )`,
        [cutoff],
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Could not prune unused OAuth clients: ${getErrorMessage(error)}`,
      );
    }
  }

  private async resolveMetadataDocument(
    clientId: string,
    now: Date,
  ): Promise<ResolvedOAuthClient> {
    const cached = this.documentCache.get(clientId);
    if (cached && cached.expiresAt > now.getTime()) return cached.client;

    let client: ResolvedOAuthClient;
    try {
      const document = validateClientMetadataDocument(
        clientId,
        await fetchClientMetadataJson(clientId),
      );
      client = { ...document, kind: OAUTH_CLIENT_KINDS.METADATA_DOCUMENT };
    } catch (error: unknown) {
      const reason =
        error instanceof ClientMetadataError
          ? error.message
          : "Client metadata could not be loaded";
      this.logger.warn(`Rejected client metadata ${clientId}: ${reason}`);
      throw new OAuthError(
        OAUTH_ERROR_CODES.INVALID_CLIENT,
        reason,
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.cacheDocument(clientId, client, now);
    return client;
  }

  private cacheDocument(
    clientId: string,
    client: ResolvedOAuthClient,
    now: Date,
  ): void {
    if (
      this.documentCache.size >= MCP_OAUTH.CLIENT_METADATA_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = this.documentCache.keys().next().value;
      if (oldestKey !== undefined) this.documentCache.delete(oldestKey);
    }
    this.documentCache.set(clientId, {
      client,
      expiresAt: now.getTime() + MCP_OAUTH.CLIENT_METADATA_CACHE_TTL_MS,
    });
  }
}
