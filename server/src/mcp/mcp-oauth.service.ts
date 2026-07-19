import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { createHash, randomBytes } from "crypto";
import { Repository } from "typeorm";

import { assertSafeOutboundUrl } from "../common/url-validation.utils";
import {
  MCP_AUTH_TYPES,
  MCPOAuthMetadata,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";

const HTTP_TIMEOUT_MS = 15_000;
/** Refresh access tokens this many ms before they actually expire. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const VERIFIER_BYTES = 32;
const STATE_BYTES = 24;
const MS_PER_SECOND = 1000;
/** Fallback access-token lifetime when the server omits expires_in (RFC 6749). */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const CLIENT_NAME = "BearlyMail";
/** Path (relative to the backend base URL) that handles the OAuth redirect. */
export const MCP_OAUTH_CALLBACK_PATH = "/mcp-servers/oauth/callback";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Drives the MCP-native OAuth 2.0 authorization flow for a single MCP server
 * connection: authorization-server metadata discovery (RFC 8414 / OIDC),
 * dynamic client registration (RFC 7591), the PKCE authorization-code grant,
 * and refresh-token rotation.
 *
 * Issue: MCP-native OAuth connect flow (Google Drive first).
 */
@Injectable()
export class MCPOAuthService {
  private readonly logger = new Logger(MCPOAuthService.name);

  constructor(
    @InjectRepository(MCPServerConfig)
    private readonly configRepo: Repository<MCPServerConfig>,
  ) {}

  /** Absolute redirect URI the authorization server calls back to. */
  static buildRedirectUri(): string {
    let base = process.env.BACKEND_URL;
    if (!base && process.env.GOOGLE_REDIRECT_URI) {
      try {
        base = new URL(process.env.GOOGLE_REDIRECT_URI).origin;
      } catch {
        // fall through to the localhost default
      }
    }
    base = base || "http://localhost:3001";
    return `${base}${MCP_OAUTH_CALLBACK_PATH}`;
  }

  /**
   * Start authorization for a connection: discover metadata, register a client
   * (once), persist PKCE state, and return the URL to send the user's browser to.
   */
  async beginAuthorization(config: MCPServerConfig): Promise<string> {
    const redirectUri = MCPOAuthService.buildRedirectUri();
    const metadata =
      config.oauthMetadata ?? (await this.discoverMetadata(config.serverUrl));

    let clientId = config.oauthClientId;
    let clientSecret = config.oauthClientSecret;
    const scope =
      config.oauthScope ?? metadata.scopesSupported?.join(" ") ?? "";

    if (!clientId) {
      const resolved = await this.resolveClient(metadata, redirectUri, scope);
      ({ clientId, clientSecret } = resolved);
    }

    const codeVerifier = base64url(randomBytes(VERIFIER_BYTES));
    const codeChallenge = base64url(
      createHash("sha256").update(codeVerifier).digest(),
    );
    const state = base64url(randomBytes(STATE_BYTES));

    await this.configRepo.update(config.id, {
      oauthMetadata: metadata,
      oauthClientId: clientId,
      oauthClientSecret: clientSecret,
      oauthScope: scope || null,
      oauthAuthState: state,
      oauthCodeVerifier: codeVerifier,
    });

    const url = new URL(metadata.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    // RFC 8707: bind the token to this specific MCP server (resource).
    url.searchParams.set("resource", config.serverUrl);
    if (scope) url.searchParams.set("scope", scope);
    return url.toString();
  }

  /** Complete authorization: exchange the code for tokens and persist them. */
  async completeAuthorization(
    state: string,
    code: string,
  ): Promise<MCPServerConfig> {
    const config = await this.configRepo.findOne({
      where: { oauthAuthState: state },
    });
    if (!config || !config.oauthMetadata || !config.oauthClientId) {
      throw new Error("Invalid or expired OAuth state");
    }
    if (!config.oauthCodeVerifier) {
      throw new Error("Missing PKCE verifier for this authorization");
    }

    const tokens = await this.requestToken(config.oauthMetadata, {
      grant_type: "authorization_code",
      code,
      redirect_uri: MCPOAuthService.buildRedirectUri(),
      client_id: config.oauthClientId,
      code_verifier: config.oauthCodeVerifier,
      resource: config.serverUrl,
      ...(config.oauthClientSecret
        ? { client_secret: config.oauthClientSecret }
        : {}),
    });

    await this.configRepo.update(config.id, {
      ...this.tokensToColumns(tokens, config.refreshToken),
      oauthAuthState: null,
      oauthCodeVerifier: null,
    });
    return this.configRepo.findOne({
      where: { id: config.id },
    }) as Promise<MCPServerConfig>;
  }

  /**
   * Return a valid access token for an OAuth connection, refreshing it first if
   * it has expired (or is about to). Throws if the connection is not authorized.
   */
  async getValidAccessToken(config: MCPServerConfig): Promise<string> {
    const notExpired =
      config.tokenExpiresAt &&
      config.tokenExpiresAt.getTime() - TOKEN_EXPIRY_SKEW_MS > Date.now();
    if (config.accessToken && notExpired) {
      return config.accessToken;
    }
    if (!config.refreshToken) {
      if (config.accessToken) return config.accessToken;
      throw new Error(
        `MCP connection "${config.name}" is not authorized — reconnect it`,
      );
    }
    return this.refresh(config);
  }

  private async refresh(config: MCPServerConfig): Promise<string> {
    if (
      !config.oauthMetadata ||
      !config.oauthClientId ||
      !config.refreshToken
    ) {
      throw new Error(
        "Cannot refresh: connection is missing OAuth credentials",
      );
    }
    const tokens = await this.requestToken(config.oauthMetadata, {
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: config.oauthClientId,
      resource: config.serverUrl,
      ...(config.oauthClientSecret
        ? { client_secret: config.oauthClientSecret }
        : {}),
    });
    const updateData = this.tokensToColumns(tokens, config.refreshToken);
    await this.configRepo.update(config.id, updateData);
    Object.assign(config, updateData);
    return tokens.access_token;
  }

  // ── Discovery / registration / token exchange ──────────────────────────────

  /**
   * Discover the authorization server for an MCP server and its OAuth endpoints.
   * Tries RFC 9728 protected-resource metadata, then RFC 8414 / OIDC discovery.
   */
  async discoverMetadata(serverUrl: string): Promise<MCPOAuthMetadata> {
    assertSafeOutboundUrl(serverUrl, "MCP server URL");
    const { origin } = new URL(serverUrl);

    let issuer = origin;
    const prm = await this.tryGetJson(
      `${origin}/.well-known/oauth-protected-resource`,
    );
    const authServers = prm?.authorization_servers;
    if (Array.isArray(authServers) && typeof authServers[0] === "string") {
      issuer = authServers[0];
    }

    // RFC 8414: /.well-known/oauth-authorization-server is inserted between
    // the authority and any tenant path. OIDC discovery: the tenant path comes
    // first, then /.well-known/openid-configuration. This matters for
    // multi-tenant providers (Auth0, Keycloak, Azure AD, Okta).
    const issuerUrl = new URL(issuer);
    const tenantPath = issuerUrl.pathname.replace(/\/$/, "");
    const wellKnownAuthServer = "/.well-known/oauth-authorization-server";
    const wellKnownOpenId = "/.well-known/openid-configuration";
    const oauthMetadataUrl = `${issuerUrl.origin}${wellKnownAuthServer}${tenantPath}`;
    const oidcMetadataUrl = `${issuerUrl.origin}${tenantPath}${wellKnownOpenId}`;

    const doc =
      (await this.tryGetJson(oauthMetadataUrl)) ??
      (await this.tryGetJson(oidcMetadataUrl));

    const readString = (value: unknown): string | undefined =>
      typeof value === "string" ? value : undefined;

    const authorizationEndpoint = readString(doc?.authorization_endpoint);
    const tokenEndpoint = readString(doc?.token_endpoint);
    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new Error(
        "MCP server does not advertise an OAuth authorization server",
      );
    }
    // The browser will be redirected to authorizationEndpoint and we will
    // POST to tokenEndpoint server-side. Reject malformed URLs, non-HTTPS
    // schemes, and private/loopback hosts (SSRF / phishing guard).
    assertSafeOutboundUrl(
      authorizationEndpoint,
      "OAuth authorization endpoint",
    );
    assertSafeOutboundUrl(tokenEndpoint, "OAuth token endpoint");
    const scopes = Array.isArray(doc?.scopes_supported)
      ? (doc.scopes_supported as unknown[]).filter(
          (scope): scope is string => typeof scope === "string",
        )
      : undefined;
    return {
      issuer: readString(doc?.issuer) ?? issuerUrl.toString(),
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint: readString(doc?.registration_endpoint),
      scopesSupported: scopes,
    };
  }

  /**
   * Resolve an OAuth client for the server: dynamic client registration when
   * the authorization server supports it (RFC 7591), otherwise a pre-configured
   * client from `MCP_OAUTH_CLIENTS` (for hosted servers like Google Drive /
   * HubSpot that require a manually-registered client).
   */
  private async resolveClient(
    metadata: MCPOAuthMetadata,
    redirectUri: string,
    scope: string,
  ): Promise<{ clientId: string; clientSecret: string | null }> {
    if (metadata.registrationEndpoint) {
      return this.registerClient(metadata, redirectUri, scope);
    }
    const configured = this.configuredClient(metadata);
    if (configured) {
      return configured;
    }
    throw new Error(
      "This MCP server requires a pre-registered OAuth client. Configure " +
        "MCP_OAUTH_CLIENTS for its authorization server, or use a server that " +
        "supports dynamic client registration.",
    );
  }

  /**
   * Look up a pre-configured OAuth client for the server's authorization server
   * from the `MCP_OAUTH_CLIENTS` env var — a JSON object keyed by the auth
   * server's host, e.g. `{"accounts.google.com":{"clientId":"…","clientSecret":"…"}}`.
   */
  private configuredClient(
    metadata: MCPOAuthMetadata,
  ): { clientId: string; clientSecret: string | null } | null {
    const raw = process.env.MCP_OAUTH_CLIENTS;
    if (!raw) {
      return null;
    }
    let map: Record<string, { clientId?: string; clientSecret?: string }>;
    try {
      map = JSON.parse(raw);
      if (typeof map !== "object" || map === null || Array.isArray(map)) {
        throw new Error("Not a JSON object");
      }
    } catch {
      this.logger.warn(
        "MCP_OAUTH_CLIENTS is set but is not a valid JSON object",
      );
      return null;
    }
    const hosts: string[] = [];
    for (const value of [metadata.issuer, metadata.authorizationEndpoint]) {
      try {
        if (value) hosts.push(new URL(value).host);
      } catch {
        // ignore unparseable URLs
      }
    }
    for (const host of hosts) {
      const entry = map[host];
      if (entry?.clientId) {
        return {
          clientId: entry.clientId,
          clientSecret: entry.clientSecret ?? null,
        };
      }
    }
    return null;
  }

  private async registerClient(
    metadata: MCPOAuthMetadata,
    redirectUri: string,
    scope: string,
  ): Promise<{ clientId: string; clientSecret: string | null }> {
    if (!metadata.registrationEndpoint) {
      throw new Error(
        "MCP server does not support dynamic client registration",
      );
    }
    assertSafeOutboundUrl(
      metadata.registrationEndpoint,
      "OAuth registration endpoint",
    );
    const res = await axios.post(
      metadata.registrationEndpoint,
      {
        client_name: CLIENT_NAME,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(scope ? { scope } : {}),
      },
      { timeout: HTTP_TIMEOUT_MS },
    );
    const clientId = res.data?.client_id;
    if (typeof clientId !== "string") {
      throw new Error("Dynamic client registration returned no client_id");
    }
    return {
      clientId,
      clientSecret:
        typeof res.data?.client_secret === "string"
          ? res.data.client_secret
          : null,
    };
  }

  private async requestToken(
    metadata: MCPOAuthMetadata,
    params: Record<string, string>,
  ): Promise<TokenResponse> {
    assertSafeOutboundUrl(metadata.tokenEndpoint, "OAuth token endpoint");
    const res = await axios.post(
      metadata.tokenEndpoint,
      new URLSearchParams(params).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: HTTP_TIMEOUT_MS,
      },
    );
    if (typeof res.data?.access_token !== "string") {
      throw new Error("Token endpoint returned no access_token");
    }
    return res.data as TokenResponse;
  }

  /** Map a token response to entity columns, keeping the old refresh token if none returned. */
  private tokensToColumns(
    tokens: TokenResponse,
    existingRefreshToken: string | null,
  ): Partial<MCPServerConfig> {
    // RFC 6749 makes expires_in optional. If the server omits it, assume one
    // hour rather than treating the token as immediately expired (which would
    // trigger a refresh on every single outbound call).
    const expiresInSeconds = tokens.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
    return {
      authType: MCP_AUTH_TYPES.OAUTH,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existingRefreshToken,
      tokenExpiresAt: new Date(Date.now() + expiresInSeconds * MS_PER_SECOND),
    };
  }

  private async tryGetJson(
    url: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      assertSafeOutboundUrl(url, "OAuth metadata URL");
      const res = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
      return res.data as Record<string, unknown>;
    } catch (err) {
      this.logger.debug(
        `OAuth metadata fetch failed for ${url}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
