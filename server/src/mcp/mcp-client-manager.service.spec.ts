import { Repository } from "typeorm";

import {
  MCP_AUTH_TYPES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPOAuthService } from "./mcp-oauth.service";
import {
  MCPAuthorizationRequiredError,
  MCPStreamableHttpClient,
} from "./mcp-streamable-http.client";

const SERVER_ID = "server-1";

const buildConfig = (overrides: Partial<MCPServerConfig> = {}) =>
  ({
    id: SERVER_ID,
    name: "Zoho Bigin",
    serverUrl: "https://example.zohomcp.com/mcp/fake-key/message",
    apiKey: null,
    authType: MCP_AUTH_TYPES.BEARER,
    accessToken: null,
    refreshToken: null,
    enabled: true,
    cachedTools: null,
    toolsCachedAt: null,
    ...overrides,
  }) as MCPServerConfig;

describe("MCPClientManagerService", () => {
  let repo: { findOne: jest.Mock; update: jest.Mock };
  let service: MCPClientManagerService;
  let requestSpy: jest.SpyInstance;

  beforeEach(() => {
    repo = { findOne: jest.fn(), update: jest.fn() };
    service = new MCPClientManagerService(
      repo as unknown as Repository<MCPServerConfig>,
      { getValidAccessToken: jest.fn() } as unknown as MCPOAuthService,
    );
    requestSpy = jest.spyOn(MCPStreamableHttpClient.prototype, "request");
  });

  afterEach(() => requestSpy.mockRestore());

  it("switches a keyless connection to OAuth when the server offers it", async () => {
    repo.findOne.mockResolvedValue(buildConfig());
    requestSpy.mockRejectedValue(new MCPAuthorizationRequiredError(true));

    const result = await service.testConnection(SERVER_ID);

    expect(result).toEqual({
      ok: false,
      toolCount: 0,
      needsAuthorization: true,
    });
    expect(repo.update).toHaveBeenCalledWith(SERVER_ID, {
      authType: MCP_AUTH_TYPES.OAUTH,
    });
  });

  it("keeps a connection with an API key as bearer (the key is just wrong)", async () => {
    repo.findOne.mockResolvedValue(buildConfig({ apiKey: "fake-api-key" }));
    requestSpy.mockRejectedValue(new MCPAuthorizationRequiredError(true));

    await service.testConnection(SERVER_ID);

    expect(repo.update).not.toHaveBeenCalled();
  });

  it("reports needsAuthorization without a network call for an unsigned-in OAuth connection", async () => {
    repo.findOne.mockResolvedValue(
      buildConfig({ authType: MCP_AUTH_TYPES.OAUTH }),
    );

    const result = await service.testConnection(SERVER_ID);

    expect(result.needsAuthorization).toBe(true);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("caches the tool list on success", async () => {
    repo.findOne.mockResolvedValue(buildConfig());
    requestSpy.mockResolvedValue({
      tools: [{ name: "search_contacts", description: "Find a contact" }],
    });

    const result = await service.testConnection(SERVER_ID);

    expect(result).toEqual({
      ok: true,
      toolCount: 1,
      needsAuthorization: false,
    });
    expect(repo.update).toHaveBeenCalledWith(
      SERVER_ID,
      expect.objectContaining({
        cachedTools: [
          {
            name: "search_contacts",
            description: "Find a contact",
            inputSchema: {},
          },
        ],
      }),
    );
  });
});
