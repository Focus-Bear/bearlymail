import { Repository } from "typeorm";

import { MCPSenderContextCache } from "../database/entities/mcp-sender-context-cache.entity";
import {
  MCP_AUTH_TYPES,
  MCP_SERVER_PURPOSES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import {
  ALL_BIGIN_TOOLS,
  BIGIN_EMPTY_RESULT,
  BIGIN_ERROR_RESULT,
  biginList,
  CONTACT_RECORD,
  createInMemoryMatchRepo,
  OPEN_DEAL,
} from "./bigin/__fixtures__/bigin.fixture";
import { BiginRecordsClient } from "./bigin/bigin-records.client";
import { BIGIN_TOOLS } from "./bigin/bigin-sender-context.constants";
import { BiginSenderContextService } from "./bigin/bigin-sender-context.service";
import { CrmSenderMatchStore } from "./crm-sender-match.store";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPOAuthService } from "./mcp-oauth.service";
import { MCPSenderContextService } from "./mcp-sender-context.service";
import { MCPStreamableHttpClient } from "./mcp-streamable-http.client";

const USER_ID = "user-1";
const SENDER = "ada@acme.example";
const TOOLS_CALL = "tools/call";

const buildServer = (overrides: Partial<MCPServerConfig> = {}) =>
  ({
    id: "bigin-1",
    userId: USER_ID,
    name: "Zoho Bigin",
    serverUrl: "https://mcp.zoho.example/fake-key",
    apiKey: "fake-token",
    authType: MCP_AUTH_TYPES.BEARER,
    purpose: MCP_SERVER_PURPOSES.SENDER_CONTEXT,
    enabled: true,
    cachedTools: ALL_BIGIN_TOOLS,
    senderLookupMapping: null,
    ...overrides,
  }) as MCPServerConfig;

interface ToolsCallParams {
  name: string;
  arguments: Record<string, Record<string, unknown>>;
}

/**
 * Exercises the real client manager and Bigin lookup; only the MCP HTTP
 * transport is mocked.
 */
describe("MCPSenderContextService", () => {
  let configRepo: { find: jest.Mock; findOne: jest.Mock };
  let cacheRepo: { findOne: jest.Mock; upsert: jest.Mock };
  let httpRequest: jest.SpyInstance;
  let service: MCPSenderContextService;

  const toolCalls = () =>
    httpRequest.mock.calls
      .filter(([method]) => method === TOOLS_CALL)
      .map(([, params]) => (params as ToolsCallParams).name);

  const useServers = (...servers: MCPServerConfig[]) => {
    configRepo.find.mockResolvedValue(servers);
    configRepo.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          servers.find((server) => server.id === where.id) ?? null,
        ),
    );
  };

  beforeEach(() => {
    configRepo = { find: jest.fn(), findOne: jest.fn() };
    cacheRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    };
    httpRequest = jest.spyOn(MCPStreamableHttpClient.prototype, "request");
    const clientManager = new MCPClientManagerService(
      configRepo as unknown as Repository<MCPServerConfig>,
      { getValidAccessToken: jest.fn() } as unknown as MCPOAuthService,
    );
    service = new MCPSenderContextService(
      configRepo as unknown as Repository<MCPServerConfig>,
      cacheRepo as unknown as Repository<MCPSenderContextCache>,
      clientManager,
      new BiginSenderContextService(
        new BiginRecordsClient(clientManager),
        new CrmSenderMatchStore(createInMemoryMatchRepo().asRepository),
      ),
    );
  });

  afterEach(() => httpRequest.mockRestore());

  it("builds Bigin context from fixed tool calls even without a derived mapping", async () => {
    useServers(buildServer());
    const resultsByTool: Record<string, unknown> = {
      [BIGIN_TOOLS.SEARCH_RECORDS]: biginList([CONTACT_RECORD]),
      [BIGIN_TOOLS.GET_RELATED_LIST_RECORDS]: biginList([OPEN_DEAL]),
      [BIGIN_TOOLS.GET_NOTES_FROM_RECORD]: BIGIN_EMPTY_RESULT,
    };
    httpRequest.mockImplementation((_method: string, params: ToolsCallParams) =>
      Promise.resolve(resultsByTool[params.name]),
    );

    const result = await service.getSenderContext(USER_ID, SENDER);

    expect(result.fromCache).toBe(false);
    expect(result.entries).toHaveLength(1);
    const [entry] = result.entries;
    expect(entry.crm?.contact?.name).toBe("Ada Lovelace");
    expect(entry.crm?.deals[0].name).toBe(OPEN_DEAL.Deal_Name);
    expect(entry.text).toContain("Contact: Ada Lovelace");
    expect(entry.text).toContain("Acme pilot · Proposal");
    expect(toolCalls()).toEqual([
      BIGIN_TOOLS.SEARCH_RECORDS,
      BIGIN_TOOLS.GET_RELATED_LIST_RECORDS,
      BIGIN_TOOLS.GET_NOTES_FROM_RECORD,
    ]);
    expect(cacheRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, entries: result.entries }),
      ["userId", "emailHash"],
    );
  });

  it("serves a fresh cached result without calling Zoho", async () => {
    useServers(buildServer());
    const entries = [
      {
        serverId: "bigin-1",
        serverName: "Zoho Bigin",
        toolName: "x",
        text: "cached",
      },
    ];
    cacheRepo.findOne.mockResolvedValue({ entries, fetchedAt: new Date() });

    const result = await service.getSenderContext(USER_ID, SENDER);

    expect(result).toMatchObject({ entries, fromCache: true });
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it("falls back to no context when Bigin is rate limited — never throws", async () => {
    useServers(buildServer());
    httpRequest.mockResolvedValue(BIGIN_ERROR_RESULT);

    const result = await service.getSenderContext(USER_ID, SENDER);

    expect(result.entries).toEqual([]);
  });

  it("falls back to no context when the connection itself fails", async () => {
    useServers(buildServer());
    httpRequest.mockRejectedValue(
      new Error("MCP server responded with HTTP 503"),
    );

    await expect(
      service.getSenderContext(USER_ID, SENDER),
    ).resolves.toMatchObject({
      entries: [],
    });
  });

  it("returns nothing when no sender-context server is connected", async () => {
    useServers();

    const result = await service.getSenderContext(USER_ID, SENDER);

    expect(result.entries).toEqual([]);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it("still uses the derived one-call mapping for other CRMs", async () => {
    useServers(
      buildServer({
        id: "hubspot-1",
        name: "HubSpot",
        cachedTools: [
          { name: "search_contacts", description: "", inputSchema: {} },
        ],
        senderLookupMapping: {
          toolName: "search_contacts",
          emailArgName: "email",
        },
      }),
    );
    httpRequest.mockResolvedValue({
      content: [{ type: "text", text: "Ada, CTO" }],
    });

    const result = await service.getSenderContext(USER_ID, SENDER);

    expect(result.entries).toEqual([
      {
        serverId: "hubspot-1",
        serverName: "HubSpot",
        toolName: "search_contacts",
        text: "Ada, CTO",
      },
    ]);
    expect(httpRequest).toHaveBeenCalledWith(TOOLS_CALL, {
      name: "search_contacts",
      arguments: { email: SENDER },
    });
  });
});
