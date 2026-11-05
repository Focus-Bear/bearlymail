import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";

import { AuditService } from "../audit/audit.service";
import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import {
  ACCESS_TOKEN_KINDS,
  PAT_SCOPES,
  PERSONAL_ACCESS_TOKENS,
} from "../constants/personal-access-tokens.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { OAuthAuthorizationCode } from "../database/entities/oauth-authorization-code.entity";
import { OAuthClient } from "../database/entities/oauth-client.entity";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { OAuthGrantsService } from "../personal-access-tokens/oauth-grants.service";
import { PersonalAccessTokensService } from "../personal-access-tokens/personal-access-tokens.service";
import { InMemoryRepository } from "../test/helpers/in-memory-repository";
import { fetchClientMetadataJson } from "./client-metadata-document";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "./mcp-oauth-metadata";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";
import { OAuthError } from "./oauth-error";
import { OAuthTokenEndpointService } from "./oauth-token-endpoint.service";

jest.mock("./client-metadata-document", () => ({
  ...jest.requireActual("./client-metadata-document"),
  fetchClientMetadataJson: jest.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const CLAUDE_CODE_CLIENT_ID =
  "https://claude.ai/oauth/claude-code-client-metadata";
const MCP_URL = "http://localhost:3001/mcp";
const AUDIT_CONTEXT = { ipAddress: "203.0.113.1", userAgent: "jest" };

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function setup() {
  const tokenRepository = new InMemoryRepository<PersonalAccessToken>();
  const clientRepository = new InMemoryRepository<OAuthClient>();
  const codeRepository = new InMemoryRepository<OAuthAuthorizationCode>(() => ({
    userId: null,
    grantedScopes: null,
    codeHash: null,
    codeExpiresAt: null,
    consumedAt: null,
    issuedTokenId: null,
  }));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const tokensService = new PersonalAccessTokensService(
    tokenRepository.asRepository(),
  );
  const grantsService = new OAuthGrantsService(
    tokenRepository.asRepository(),
    tokensService,
  );
  const registry = new OAuthClientRegistryService(
    clientRepository.asRepository(),
  );
  const authorization = new OAuthAuthorizationService(
    codeRepository.asRepository(),
    registry,
    tokensService,
    audit as unknown as AuditService,
  );
  const tokenEndpoint = new OAuthTokenEndpointService(
    codeRepository.asRepository(),
    grantsService,
    audit as unknown as AuditService,
  );
  return {
    tokenRepository,
    codeRepository,
    audit,
    tokensService,
    registry,
    authorization,
    tokenEndpoint,
  };
}

type Harness = ReturnType<typeof setup>;

function requestIdFrom(consentUrl: string): string {
  return new URL(consentUrl).searchParams.get(MCP_OAUTH.CONSENT_REQUEST_PARAM)!;
}

async function registerClaudeWeb(harness: Harness): Promise<string> {
  const registered = await harness.registry.register({
    client_name: "Claude",
    redirect_uris: [CLAUDE_CALLBACK],
    token_endpoint_auth_method: "client_secret_basic",
  });
  return registered.client_id;
}

async function authorizeAndApprove(
  harness: Harness,
  clientId: string,
  options: { redirectUri?: string; allowSend?: boolean; scope?: string } = {},
) {
  const { verifier, challenge } = pkcePair();
  const redirectUri = options.redirectUri ?? CLAUDE_CALLBACK;
  const consentUrl = await harness.authorization.beginAuthorization({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "state-123",
    scope: options.scope ?? "mail:read mail:send offline_access",
    resource: MCP_URL,
  });
  const requestId = requestIdFrom(consentUrl);
  const callback = new URL(
    await harness.authorization.decide(
      USER_ID,
      requestId,
      { approve: true, allowSend: options.allowSend ?? false },
      AUDIT_CONTEXT,
    ),
  );
  return {
    verifier,
    redirectUri,
    requestId,
    callback,
    code: callback.searchParams.get("code")!,
  };
}

function exchangeCode(
  harness: Harness,
  clientId: string,
  flow: { code: string; verifier: string; redirectUri: string },
) {
  return harness.tokenEndpoint.exchange({
    grant_type: "authorization_code",
    code: flow.code,
    client_id: clientId,
    redirect_uri: flow.redirectUri,
    code_verifier: flow.verifier,
    resource: MCP_URL,
  });
}

async function expectOAuthError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(OAuthError);
  await promise.catch((error: OAuthError) => expect(error.code).toBe(code));
}

describe("MCP OAuth flow", () => {
  beforeEach(() => {
    delete process.env.BACKEND_URL;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  describe("discovery metadata", () => {
    it("advertises the /mcp resource and this server as its issuer", () => {
      expect(buildProtectedResourceMetadata()).toMatchObject({
        resource: MCP_URL,
        authorization_servers: ["http://localhost:3001"],
        scopes_supported: [PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_SEND],
      });
    });

    it("advertises what claude.ai needs to pick a metadata document", () => {
      expect(buildAuthorizationServerMetadata()).toMatchObject({
        issuer: "http://localhost:3001",
        authorization_endpoint: "http://localhost:3001/oauth/authorize",
        token_endpoint: "http://localhost:3001/oauth/token",
        registration_endpoint: "http://localhost:3001/oauth/register",
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        client_id_metadata_document_supported: true,
      });
    });
  });

  describe("dynamic client registration", () => {
    it("always registers a public client", async () => {
      const harness = setup();
      const registered = await harness.registry.register({
        client_name: "Claude",
        redirect_uris: [CLAUDE_CALLBACK],
        token_endpoint_auth_method: "client_secret_basic",
      });
      expect(registered).toMatchObject({
        client_name: "Claude",
        redirect_uris: [CLAUDE_CALLBACK],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
      });
      expect(registered).not.toHaveProperty("client_secret");
    });

    it("refuses redirect URIs that are neither HTTPS nor loopback", async () => {
      await expectOAuthError(
        setup().registry.register({
          redirect_uris: ["http://evil.example/cb"],
        }),
        "invalid_redirect_uri",
      );
    });
  });

  describe("authorization code + PKCE", () => {
    it("issues tokens that authenticate as the same principal as a PAT", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const flow = await authorizeAndApprove(harness, clientId);

      expect(flow.callback.origin + flow.callback.pathname).toBe(
        CLAUDE_CALLBACK,
      );
      expect(flow.callback.searchParams.get("state")).toBe("state-123");
      expect(flow.callback.searchParams.get("iss")).toBe(
        "http://localhost:3001",
      );

      const tokens = await exchangeCode(harness, clientId, flow);
      expect(tokens).toMatchObject({
        token_type: "Bearer",
        expires_in: MCP_OAUTH.ACCESS_TOKEN_TTL_SECONDS,
        scope: PAT_SCOPES.MAIL_READ,
      });
      expect(
        tokens.access_token.startsWith(MCP_OAUTH.ACCESS_TOKEN_PREFIX),
      ).toBe(true);
      expect(
        tokens.refresh_token.startsWith(MCP_OAUTH.REFRESH_TOKEN_PREFIX),
      ).toBe(true);

      const principal = await harness.tokensService.authenticate(
        tokens.access_token,
      );
      expect(principal).toEqual({
        userId: USER_ID,
        tokenId: expect.any(String),
        scopes: [PAT_SCOPES.MAIL_READ],
      });

      const [row] = harness.tokenRepository.rows;
      expect(row).toMatchObject({
        kind: ACCESS_TOKEN_KINDS.OAUTH,
        name: "Claude (claude.ai)",
        oauthClientId: clientId,
      });
      expect(JSON.stringify(row)).not.toContain(tokens.access_token);
      expect(JSON.stringify(row)).not.toContain(tokens.refresh_token);
    });

    it("grants mail:send only when the user ticks it", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const tokens = await exchangeCode(
        harness,
        clientId,
        await authorizeAndApprove(harness, clientId, { allowSend: true }),
      );
      expect(tokens.scope).toBe("mail:read mail:send");
    });

    it("shows the consent screen where the code will go", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const { challenge } = pkcePair();
      const consentUrl = await harness.authorization.beginAuthorization({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      expect(
        consentUrl.startsWith("http://localhost:3000/oauth/consent?request="),
      ).toBe(true);
      await expect(
        harness.authorization.getConsentRequest(requestIdFrom(consentUrl)),
      ).resolves.toMatchObject({
        clientName: "Claude",
        clientHost: null,
        redirectHost: "claude.ai",
        isLoopbackRedirect: false,
        canRequestSend: true,
      });
    });

    it("rejects the code with the wrong verifier, client or redirect URI", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const flow = await authorizeAndApprove(harness, clientId);

      await expectOAuthError(
        exchangeCode(harness, clientId, {
          ...flow,
          verifier: pkcePair().verifier,
        }),
        "invalid_grant",
      );
      await expectOAuthError(
        exchangeCode(harness, "bm_client_other", flow),
        "invalid_grant",
      );
      await expectOAuthError(
        exchangeCode(harness, clientId, {
          ...flow,
          redirectUri: `${CLAUDE_CALLBACK}?x=1`,
        }),
        "invalid_grant",
      );
      // None of the failures burnt the code.
      await expect(
        exchangeCode(harness, clientId, flow),
      ).resolves.toBeDefined();
    });

    it("rejects an expired code", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const flow = await authorizeAndApprove(harness, clientId);
      const later = new Date(
        Date.now() + MCP_OAUTH.AUTHORIZATION_CODE_TTL_MS + 1,
      );
      await expectOAuthError(
        harness.tokenEndpoint.exchange(
          {
            grant_type: "authorization_code",
            code: flow.code,
            client_id: clientId,
            redirect_uri: flow.redirectUri,
            code_verifier: flow.verifier,
          },
          later,
        ),
        "invalid_grant",
      );
    });

    it("revokes the connection when a code is replayed", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const flow = await authorizeAndApprove(harness, clientId);
      const tokens = await exchangeCode(harness, clientId, flow);

      await expectOAuthError(
        exchangeCode(harness, clientId, flow),
        "invalid_grant",
      );
      await expect(
        harness.tokensService.authenticate(tokens.access_token),
      ).resolves.toBeNull();
      expect(harness.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: MCP_OAUTH.AUDIT_ACTIONS.CODE_REPLAYED,
        }),
      );
    });

    it("rejects a token request for another resource", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const flow = await authorizeAndApprove(harness, clientId);
      await expectOAuthError(
        harness.tokenEndpoint.exchange({
          grant_type: "authorization_code",
          code: flow.code,
          client_id: clientId,
          redirect_uri: flow.redirectUri,
          code_verifier: flow.verifier,
          resource: "https://evil.example/mcp",
        }),
        "invalid_target",
      );
    });

    it("refuses unsupported grant types", async () => {
      await expectOAuthError(
        setup().tokenEndpoint.exchange({ grant_type: "client_credentials" }),
        "unsupported_grant_type",
      );
    });
  });

  describe("authorize request validation", () => {
    it("never redirects to an unknown client or unregistered redirect URI", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      await expectOAuthError(
        harness.authorization.beginAuthorization({
          client_id: "bm_client_unknown",
          redirect_uri: CLAUDE_CALLBACK,
        }),
        "invalid_client",
      );
      await expectOAuthError(
        harness.authorization.beginAuthorization({
          client_id: clientId,
          redirect_uri: "https://evil.example/cb",
        }),
        "invalid_request",
      );
    });

    it.each([
      ["no PKCE challenge", { code_challenge: undefined }, "invalid_request"],
      [
        "a plain PKCE method",
        { code_challenge_method: "plain" },
        "invalid_request",
      ],
      [
        "the implicit flow",
        { response_type: "token" },
        "unsupported_response_type",
      ],
      [
        "another resource",
        { resource: "https://evil.example/mcp" },
        "invalid_target",
      ],
      ["only unknown scopes", { scope: "admin" }, "invalid_scope"],
    ])(
      "redirects back with an error for %s",
      async (_label, override, error) => {
        const harness = setup();
        const clientId = await registerClaudeWeb(harness);
        const target = new URL(
          await harness.authorization.beginAuthorization({
            response_type: "code",
            client_id: clientId,
            redirect_uri: CLAUDE_CALLBACK,
            code_challenge: pkcePair().challenge,
            code_challenge_method: "S256",
            state: "s",
            ...override,
          }),
        );
        expect(target.origin + target.pathname).toBe(CLAUDE_CALLBACK);
        expect(target.searchParams.get("error")).toBe(error);
        expect(target.searchParams.get("state")).toBe("s");
        expect(harness.codeRepository.rows).toHaveLength(0);
      },
    );

    it("accepts the resource with different host case and a trailing slash", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const consentUrl = await harness.authorization.beginAuthorization({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: pkcePair().challenge,
        code_challenge_method: "S256",
        resource: "HTTP://LOCALHOST:3001/mcp/",
      });
      expect(consentUrl).toContain("/oauth/consent?request=");
    });
  });

  describe("consent decisions", () => {
    it("sends access_denied when the user declines, and can't be answered twice", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const consentUrl = await harness.authorization.beginAuthorization({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: pkcePair().challenge,
        code_challenge_method: "S256",
        state: "s",
      });
      const requestId = requestIdFrom(consentUrl);
      const denied = new URL(
        await harness.authorization.decide(
          USER_ID,
          requestId,
          { approve: false, allowSend: false },
          AUDIT_CONTEXT,
        ),
      );
      expect(denied.searchParams.get("error")).toBe("access_denied");
      expect(denied.searchParams.get("code")).toBeNull();
      await expect(
        harness.authorization.decide(
          USER_ID,
          requestId,
          { approve: true, allowSend: false },
          AUDIT_CONTEXT,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses to approve once the user has too many tokens", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      for (
        let i = 0;
        i < PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER;
        i++
      ) {
        await harness.tokensService.create(USER_ID, {
          name: `t${i}`,
          scopes: [PAT_SCOPES.MAIL_READ],
        });
      }
      await expect(
        authorizeAndApprove(harness, clientId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("expires a request the user never answers", async () => {
      const harness = setup();
      const clientId = await registerClaudeWeb(harness);
      const consentUrl = await harness.authorization.beginAuthorization({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: pkcePair().challenge,
        code_challenge_method: "S256",
      });
      const later = new Date(
        Date.now() + MCP_OAUTH.AUTHORIZATION_REQUEST_TTL_MS + 1,
      );
      await expect(
        harness.authorization.getConsentRequest(
          requestIdFrom(consentUrl),
          later,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("refresh and revocation", () => {
    async function connect(harness: Harness) {
      const clientId = await registerClaudeWeb(harness);
      const tokens = await exchangeCode(
        harness,
        clientId,
        await authorizeAndApprove(harness, clientId),
      );
      return { clientId, tokens };
    }

    it("rotates both tokens; the old ones stop working", async () => {
      const harness = setup();
      const { clientId, tokens } = await connect(harness);
      const refreshed = await harness.tokenEndpoint.exchange({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      });
      expect(refreshed.access_token).not.toBe(tokens.access_token);
      expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
      expect(refreshed.scope).toBe(PAT_SCOPES.MAIL_READ);

      await expect(
        harness.tokensService.authenticate(tokens.access_token),
      ).resolves.toBeNull();
      await expect(
        harness.tokensService.authenticate(refreshed.access_token),
      ).resolves.not.toBeNull();
      await expectOAuthError(
        harness.tokenEndpoint.exchange({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }),
        "invalid_grant",
      );
      expect(harness.tokenRepository.rows).toHaveLength(1);
    });

    describe("when an old refresh token is used again", () => {
      async function refreshOnce(harness: Harness) {
        const { clientId, tokens } = await connect(harness);
        const refreshed = await harness.tokenEndpoint.exchange({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        });
        const reuseOldToken = (now: Date) =>
          harness.tokenEndpoint.exchange(
            {
              grant_type: "refresh_token",
              refresh_token: tokens.refresh_token,
              client_id: clientId,
            },
            now,
          );
        return { refreshed, reuseOldToken };
      }

      it("ends the connection, as the token has probably leaked", async () => {
        const harness = setup();
        const { refreshed, reuseOldToken } = await refreshOnce(harness);
        const later = new Date(
          Date.now() + MCP_OAUTH.REFRESH_REUSE_GRACE_MS + 1000,
        );

        await expectOAuthError(reuseOldToken(later), "invalid_grant");

        await expect(
          harness.tokensService.authenticate(refreshed.access_token),
        ).resolves.toBeNull();
        expect(harness.audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: MCP_OAUTH.AUDIT_ACTIONS.REFRESH_REPLAYED,
          }),
        );
      });

      it("treats an immediate repeat as a retry and keeps the connection", async () => {
        const harness = setup();
        const { refreshed, reuseOldToken } = await refreshOnce(harness);

        await expectOAuthError(reuseOldToken(new Date()), "invalid_grant");

        await expect(
          harness.tokensService.authenticate(refreshed.access_token),
        ).resolves.not.toBeNull();
      });
    });

    it("lets only one of two concurrent refreshes win", async () => {
      const harness = setup();
      const { clientId, tokens } = await connect(harness);
      const request = {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      };
      const results = await Promise.allSettled([
        harness.tokenEndpoint.exchange(request),
        harness.tokenEndpoint.exchange(request),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
    });

    it("refuses a refresh token from another client or after it lapses", async () => {
      const harness = setup();
      const { clientId, tokens } = await connect(harness);
      await expectOAuthError(
        harness.tokenEndpoint.exchange({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: "bm_client_other",
        }),
        "invalid_grant",
      );
      await expectOAuthError(
        harness.tokenEndpoint.exchange(
          {
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token,
            client_id: clientId,
          },
          new Date(
            Date.now() + MCP_OAUTH.REFRESH_TOKEN_TTL_MS + MILLISECONDS.MINUTE,
          ),
        ),
        "invalid_grant",
      );
    });

    it("revokes the whole connection from Settings", async () => {
      const harness = setup();
      const { clientId, tokens } = await connect(harness);
      const [summary] = await harness.tokensService.list(USER_ID);
      await harness.tokensService.revoke(USER_ID, summary.id);
      await expect(
        harness.tokensService.authenticate(tokens.access_token),
      ).resolves.toBeNull();
      await expectOAuthError(
        harness.tokenEndpoint.exchange({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }),
        "invalid_grant",
      );
    });

    it("revokes through RFC 7009 and ignores unknown tokens", async () => {
      const harness = setup();
      const { clientId, tokens } = await connect(harness);
      await harness.tokenEndpoint.revoke({
        token: "bm_ort_unknown",
        client_id: clientId,
      });
      await expect(
        harness.tokensService.authenticate(tokens.access_token),
      ).resolves.not.toBeNull();
      await harness.tokenEndpoint.revoke({
        token: tokens.refresh_token,
        client_id: clientId,
      });
      await expect(
        harness.tokensService.authenticate(tokens.access_token),
      ).resolves.toBeNull();
    });
  });

  describe("Client ID Metadata Documents (claude.ai, Claude Code)", () => {
    const fetchMock = fetchClientMetadataJson as jest.MockedFunction<
      typeof fetchClientMetadataJson
    >;

    beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue({
        client_id: CLAUDE_CODE_CLIENT_ID,
        client_name: "Claude Code",
        redirect_uris: [
          "http://localhost/callback",
          "http://127.0.0.1/callback",
        ],
        token_endpoint_auth_method: "none",
      });
    });

    it("connects Claude Code on its ephemeral loopback port", async () => {
      const harness = setup();
      const flow = await authorizeAndApprove(harness, CLAUDE_CODE_CLIENT_ID, {
        redirectUri: "http://localhost:53682/callback",
      });
      const tokens = await exchangeCode(harness, CLAUDE_CODE_CLIENT_ID, flow);
      expect(tokens.access_token).toBeDefined();
      expect(harness.tokenRepository.rows[0].name).toBe(
        "Claude Code (claude.ai)",
      );
    });

    it("names the document's host and warns about loopback on the consent screen", async () => {
      const harness = setup();
      const consentUrl = await harness.authorization.beginAuthorization({
        response_type: "code",
        client_id: CLAUDE_CODE_CLIENT_ID,
        redirect_uri: "http://127.0.0.1:4000/callback",
        code_challenge: pkcePair().challenge,
        code_challenge_method: "S256",
      });
      await expect(
        harness.authorization.getConsentRequest(requestIdFrom(consentUrl)),
      ).resolves.toMatchObject({
        clientHost: "claude.ai",
        redirectHost: "127.0.0.1",
        isLoopbackRedirect: true,
      });
    });

    it("caches the document briefly", async () => {
      const harness = setup();
      await harness.registry.resolve(CLAUDE_CODE_CLIENT_ID);
      await harness.registry.resolve(CLAUDE_CODE_CLIENT_ID);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a document that doesn't vouch for its own URL", async () => {
      fetchMock.mockResolvedValue({
        client_id: "https://evil.example/client.json",
        redirect_uris: [CLAUDE_CALLBACK],
      });
      await expectOAuthError(
        setup().registry.resolve(CLAUDE_CODE_CLIENT_ID),
        "invalid_client",
      );
    });
  });
});
