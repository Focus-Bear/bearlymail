import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import {
  MCP_AUTH_TYPES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import { MCPOAuthService } from "./mcp-oauth.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const AS_METADATA = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  registration_endpoint: "https://auth.example.com/register",
  scopes_supported: ["drive.readonly", "offline"],
};

describe("MCPOAuthService", () => {
  let service: MCPOAuthService;
  let repo: jest.Mocked<Repository<MCPServerConfig>>;

  const baseConfig = (): MCPServerConfig =>
    ({
      id: "cfg-1",
      userId: "user-1",
      name: "Google Drive",
      serverUrl: "https://drive-mcp.example.com/mcp",
      apiKey: null,
      authType: MCP_AUTH_TYPES.OAUTH,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      oauthClientId: null,
      oauthClientSecret: null,
      oauthMetadata: null,
      oauthScope: null,
      oauthAuthState: null,
      oauthCodeVerifier: null,
      cachedTools: null,
      toolsCachedAt: null,
      senderLookupMapping: null,
      enabled: true,
    }) as unknown as MCPServerConfig;

  beforeEach(async () => {
    delete process.env.BACKEND_URL;
    process.env.GOOGLE_REDIRECT_URI =
      "https://api.example.com/auth/google/callback";
    const module = await Test.createTestingModule({
      providers: [
        MCPOAuthService,
        {
          provide: getRepositoryToken(MCPServerConfig),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(MCPOAuthService);
    repo = module.get(getRepositoryToken(MCPServerConfig));
    jest.clearAllMocks();
  });

  describe("buildRedirectUri", () => {
    it("derives the callback URL from GOOGLE_REDIRECT_URI", () => {
      expect(MCPOAuthService.buildRedirectUri()).toBe(
        "https://api.example.com/mcp-servers/oauth/callback",
      );
    });
  });

  describe("discoverMetadata", () => {
    it("parses authorization-server metadata", async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes("oauth-protected-resource")) {
          return Promise.reject(new Error("404"));
        }
        if (url.includes("oauth-authorization-server")) {
          return Promise.resolve({ data: AS_METADATA });
        }
        return Promise.reject(new Error("404"));
      });

      const meta = await service.discoverMetadata(
        "https://drive-mcp.example.com/mcp",
      );
      expect(meta.authorizationEndpoint).toBe(
        AS_METADATA.authorization_endpoint,
      );
      expect(meta.tokenEndpoint).toBe(AS_METADATA.token_endpoint);
      expect(meta.registrationEndpoint).toBe(AS_METADATA.registration_endpoint);
      expect(meta.scopesSupported).toEqual(["drive.readonly", "offline"]);
    });

    it("follows protected-resource metadata to a separate auth server", async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes("oauth-protected-resource")) {
          return Promise.resolve({
            data: { authorization_servers: ["https://auth.example.com"] },
          });
        }
        if (url.startsWith("https://auth.example.com/.well-known")) {
          return Promise.resolve({ data: AS_METADATA });
        }
        return Promise.reject(new Error("404"));
      });

      const meta = await service.discoverMetadata(
        "https://drive-mcp.example.com/mcp",
      );
      expect(meta.tokenEndpoint).toBe("https://auth.example.com/token");
    });

    it("throws when no OAuth endpoints are advertised", async () => {
      mockedAxios.get.mockRejectedValue(new Error("404"));
      await expect(
        service.discoverMetadata("https://drive-mcp.example.com/mcp"),
      ).rejects.toThrow(/does not advertise/i);
    });

    it("rejects non-https server URLs (SSRF guard)", async () => {
      await expect(
        service.discoverMetadata("http://drive-mcp.example.com/mcp"),
      ).rejects.toThrow(/https/i);
    });
  });

  describe("beginAuthorization", () => {
    it("registers a client and builds a PKCE authorization URL", async () => {
      mockedAxios.get.mockImplementation((url: string) =>
        url.includes("oauth-authorization-server")
          ? Promise.resolve({ data: AS_METADATA })
          : Promise.reject(new Error("404")),
      );
      mockedAxios.post.mockResolvedValue({ data: { client_id: "client-123" } });

      const url = await service.beginAuthorization(baseConfig());
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        "https://auth.example.com/authorize",
      );
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("client_id")).toBe("client-123");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
      expect(parsed.searchParams.get("state")).toBeTruthy();
      expect(parsed.searchParams.get("resource")).toBe(
        "https://drive-mcp.example.com/mcp",
      );
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "https://api.example.com/mcp-servers/oauth/callback",
      );

      // Persisted the PKCE verifier + state for the callback to use.
      expect(repo.update).toHaveBeenCalledWith(
        "cfg-1",
        expect.objectContaining({
          oauthClientId: "client-123",
          oauthAuthState: parsed.searchParams.get("state"),
          oauthCodeVerifier: expect.any(String),
        }),
      );
    });

    it("fails when the server has no DCR and no configured client", async () => {
      delete process.env.MCP_OAUTH_CLIENTS;
      mockedAxios.get.mockImplementation((url: string) =>
        url.includes("oauth-authorization-server")
          ? Promise.resolve({
              data: { ...AS_METADATA, registration_endpoint: undefined },
            })
          : Promise.reject(new Error("404")),
      );
      await expect(service.beginAuthorization(baseConfig())).rejects.toThrow(
        /pre-registered OAuth client/i,
      );
    });

    it("uses a pre-configured client when the server has no dynamic registration", async () => {
      process.env.MCP_OAUTH_CLIENTS = JSON.stringify({
        "auth.example.com": { clientId: "preconf-1", clientSecret: "shh" },
      });
      try {
        mockedAxios.get.mockImplementation((url: string) =>
          url.includes("oauth-authorization-server")
            ? Promise.resolve({
                data: { ...AS_METADATA, registration_endpoint: undefined },
              })
            : Promise.reject(new Error("404")),
        );

        const url = await service.beginAuthorization(baseConfig());

        expect(new URL(url).searchParams.get("client_id")).toBe("preconf-1");
        // No dynamic client registration call when a client is pre-configured.
        expect(mockedAxios.post).not.toHaveBeenCalled();
      } finally {
        delete process.env.MCP_OAUTH_CLIENTS;
      }
    });
  });

  describe("completeAuthorization", () => {
    it("exchanges the code and stores tokens, clearing PKCE state", async () => {
      const config = {
        ...baseConfig(),
        oauthClientId: "client-123",
        oauthCodeVerifier: "verifier",
        oauthAuthState: "state-xyz",
        oauthMetadata: {
          authorizationEndpoint: AS_METADATA.authorization_endpoint,
          tokenEndpoint: AS_METADATA.token_endpoint,
        },
      } as MCPServerConfig;
      repo.findOne.mockResolvedValue(config);
      mockedAxios.post.mockResolvedValue({
        data: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 },
      });

      await service.completeAuthorization("state-xyz", "auth-code");

      expect(repo.update).toHaveBeenCalledWith(
        "cfg-1",
        expect.objectContaining({
          accessToken: "at-1",
          refreshToken: "rt-1",
          oauthAuthState: null,
          oauthCodeVerifier: null,
        }),
      );
    });

    it("rejects an unknown state", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.completeAuthorization("nope", "code"),
      ).rejects.toThrow(/invalid or expired/i);
    });
  });

  describe("getValidAccessToken", () => {
    it("returns the current token when it has not expired", async () => {
      const config = {
        ...baseConfig(),
        accessToken: "still-good",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
      } as MCPServerConfig;
      await expect(service.getValidAccessToken(config)).resolves.toBe(
        "still-good",
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("refreshes an expired token", async () => {
      const config = {
        ...baseConfig(),
        accessToken: "old",
        refreshToken: "rt-1",
        oauthClientId: "client-123",
        tokenExpiresAt: new Date(Date.now() - 1000),
        oauthMetadata: {
          authorizationEndpoint: AS_METADATA.authorization_endpoint,
          tokenEndpoint: AS_METADATA.token_endpoint,
        },
      } as MCPServerConfig;
      mockedAxios.post.mockResolvedValue({
        data: { access_token: "new-token", expires_in: 3600 },
      });

      await expect(service.getValidAccessToken(config)).resolves.toBe(
        "new-token",
      );
      expect(repo.update).toHaveBeenCalledWith(
        "cfg-1",
        expect.objectContaining({ accessToken: "new-token" }),
      );
    });

    it("throws when not authorized and no refresh token", async () => {
      await expect(service.getValidAccessToken(baseConfig())).rejects.toThrow(
        /not authorized/i,
      );
    });
  });
});
