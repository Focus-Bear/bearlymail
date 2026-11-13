import { MILLISECONDS } from "../../constants/time-constants";
import {
  MCP_AUTH_TYPES,
  MCPServerConfig,
} from "../../database/entities/mcp-server-config.entity";
import { CRM_MATCH_KINDS } from "../crm-sender-context.types";
import { CrmSenderMatchStore } from "../crm-sender-match.store";
import { MCPClientManagerService } from "../mcp-client-manager.service";
import {
  ACCOUNT_RECORD,
  ALL_BIGIN_TOOLS,
  BIGIN_EMPTY_RESULT,
  BIGIN_ERROR_RESULT,
  BIGIN_RECORD_GONE_RESULT,
  biginList,
  CLOSED_DEAL,
  CONTACT_RECORD,
  createInMemoryMatchRepo,
  NOTE_RECORD,
  OPEN_DEAL,
} from "./__fixtures__/bigin.fixture";
import { BiginRecordsClient } from "./bigin-records.client";
import {
  BIGIN_ARG_GROUPS,
  BIGIN_MISS_TTL_MS,
  BIGIN_MODULES,
  BIGIN_TOOLS,
  CRM_PROVIDERS,
} from "./bigin-sender-context.constants";
import {
  BiginLookupRequest,
  BiginSenderContextService,
} from "./bigin-sender-context.service";

const SENDER = "ada@acme.example";
const UNKNOWN_SENDER = "nobody@gmail.com";
const USER_ID = "user-1";
const CONTACT_URL = "https://bigin.zoho.com.au/bigin/Home#/contacts/contact-1";

const buildServer = (overrides: Partial<MCPServerConfig> = {}) =>
  ({
    id: "server-1",
    name: "Zoho Bigin",
    serverUrl: "https://acme-123.zohomcp.com.au/mcp/fake-key/message",
    authType: MCP_AUTH_TYPES.BEARER,
    oauthMetadata: null,
    cachedTools: ALL_BIGIN_TOOLS,
    ...overrides,
  }) as MCPServerConfig;

type ToolArgs = Record<string, Record<string, unknown>>;

interface Responses {
  contacts?: unknown;
  accounts?: unknown;
  byId?: unknown;
  deals?: unknown;
  notes?: unknown;
}

describe("BiginSenderContextService", () => {
  let callTool: jest.Mock;
  let matches: ReturnType<typeof createInMemoryMatchRepo>;
  let service: BiginSenderContextService;

  const respond = (results: Responses) =>
    callTool.mockImplementation(
      (_serverId: string, toolName: string, args: ToolArgs) => {
        const module = args[BIGIN_ARG_GROUPS.PATH].module_api_name;
        const byTool: Record<string, unknown> = {
          [BIGIN_TOOLS.SEARCH_RECORDS]:
            module === BIGIN_MODULES.CONTACTS
              ? results.contacts
              : results.accounts,
          [BIGIN_TOOLS.GET_SPECIFIC_RECORD]: results.byId,
          [BIGIN_TOOLS.GET_RELATED_LIST_RECORDS]: results.deals,
          [BIGIN_TOOLS.GET_NOTES_FROM_RECORD]: results.notes,
        };
        const result = byTool[toolName] ?? BIGIN_EMPTY_RESULT;
        return result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result);
      },
    );

  const toolsCalled = () =>
    callTool.mock.calls.map(([, toolName]: [string, string]) => toolName);

  const lookup = (overrides: Partial<BiginLookupRequest> = {}) =>
    service.lookup({
      server: buildServer(),
      userId: USER_ID,
      email: SENDER,
      forceRefresh: false,
      ...overrides,
    });

  /** Run one lookup that stores a match, then reset the call log. */
  const primeStoredContact = async () => {
    respond({ contacts: biginList([CONTACT_RECORD]) });
    await lookup();
    callTool.mockClear();
  };

  beforeEach(() => {
    callTool = jest.fn();
    matches = createInMemoryMatchRepo();
    service = new BiginSenderContextService(
      new BiginRecordsClient({
        callTool,
      } as unknown as MCPClientManagerService),
      new CrmSenderMatchStore(matches.asRepository),
    );
  });

  afterEach(() => jest.useRealTimers());

  describe("first lookup (search)", () => {
    it("finds the contact with fixed calls and links to it in Bigin", async () => {
      respond({
        contacts: biginList([CONTACT_RECORD]),
        deals: biginList([CLOSED_DEAL, OPEN_DEAL]),
        notes: biginList([NOTE_RECORD]),
      });

      const context = await lookup();

      expect(context).toEqual({
        provider: CRM_PROVIDERS.ZOHO_BIGIN,
        matchedBy: CRM_MATCH_KINDS.CONTACT_EMAIL,
        matchCount: 1,
        contact: {
          id: "contact-1",
          name: "Ada Lovelace",
          title: "CTO",
          owner: "Jeremy",
        },
        company: { id: "account-1", name: "Acme", website: null },
        deals: [
          expect.objectContaining({ id: OPEN_DEAL.id, isOpen: true }),
          expect.objectContaining({ id: CLOSED_DEAL.id, isOpen: false }),
        ],
        notes: [expect.objectContaining({ content: NOTE_RECORD.Note_Content })],
        recordUrl: CONTACT_URL,
      });
      expect(callTool).toHaveBeenCalledWith(
        "server-1",
        BIGIN_TOOLS.SEARCH_RECORDS,
        {
          path_variables: { module_api_name: "Contacts" },
          query_params: { email: SENDER },
        },
      );
    });

    it("stores the matched record ID and name for this connection", async () => {
      respond({ contacts: biginList([CONTACT_RECORD]) });

      await lookup();

      expect(matches.repo.rows).toEqual([
        expect.objectContaining({
          userId: USER_ID,
          serverId: "server-1",
          recordModule: "Contacts",
          recordId: "contact-1",
          displayName: "Ada Lovelace",
          matchCount: 1,
          connectionFingerprint: expect.any(String),
          matchedAt: expect.any(Date),
        }),
      ]);
    });

    it("uses the most recently modified contact when several match", async () => {
      const stale = {
        ...CONTACT_RECORD,
        id: "contact-0",
        Modified_Time: "2020-01-01T00:00:00Z",
      };
      respond({ contacts: biginList([stale, CONTACT_RECORD]) });

      const context = await lookup();

      expect(context?.contact?.id).toBe("contact-1");
      expect(context?.matchCount).toBe(2);
    });

    it("falls back to the company whose website is the sender's domain", async () => {
      const lookalike = {
        ...ACCOUNT_RECORD,
        id: "account-2",
        Website: "acme.example.net",
      };
      respond({
        contacts: BIGIN_EMPTY_RESULT,
        accounts: biginList([lookalike, ACCOUNT_RECORD]),
      });

      const context = await lookup();

      expect(context).toMatchObject({
        matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
        contact: null,
        company: { id: "account-1", name: "Acme" },
        recordUrl: "https://bigin.zoho.com.au/bigin/Home#/accounts/account-1",
      });
      expect(matches.repo.rows[0]).toMatchObject({
        recordModule: "Accounts",
        displayName: "Acme",
      });
    });

    it("propagates a search failure and stores nothing", async () => {
      respond({ contacts: BIGIN_ERROR_RESULT });

      await expect(lookup()).rejects.toThrow(BIGIN_TOOLS.SEARCH_RECORDS);
      expect(matches.repo.rows).toEqual([]);
    });

    it("keeps the contact when deals or notes fail", async () => {
      respond({
        contacts: biginList([CONTACT_RECORD]),
        deals: new Error("HTTP 429"),
        notes: BIGIN_ERROR_RESULT,
      });

      const context = await lookup();

      expect(context?.contact?.id).toBe("contact-1");
      expect(context?.deals).toEqual([]);
      expect(context?.notes).toEqual([]);
    });

    it("skips deals and notes when the server doesn't expose those tools", async () => {
      respond({ contacts: biginList([CONTACT_RECORD]) });

      await lookup({
        server: buildServer({
          cachedTools: [
            {
              name: BIGIN_TOOLS.SEARCH_RECORDS,
              description: "",
              inputSchema: {},
            },
          ],
        }),
      });

      expect(toolsCalled()).toEqual([BIGIN_TOOLS.SEARCH_RECORDS]);
    });
  });

  describe("stored match", () => {
    it("fetches the stored record by ID instead of searching", async () => {
      await primeStoredContact();
      respond({ byId: biginList([CONTACT_RECORD]) });

      const context = await lookup();

      expect(context?.contact?.name).toBe("Ada Lovelace");
      expect(toolsCalled()).not.toContain(BIGIN_TOOLS.SEARCH_RECORDS);
      expect(callTool).toHaveBeenCalledWith(
        "server-1",
        BIGIN_TOOLS.GET_SPECIFIC_RECORD,
        { path_variables: { module_api_name: "Contacts", id: "contact-1" } },
      );
    });

    it.each([
      [
        "Bigin reports the record ID invalid (deleted)",
        BIGIN_RECORD_GONE_RESULT,
      ],
      ["the record comes back empty (204)", BIGIN_EMPTY_RESULT],
      [
        "the contact no longer has the sender's address",
        biginList([{ ...CONTACT_RECORD, Email: "someone-else@acme.example" }]),
      ],
    ])("forgets the match and searches again when %s", async (_label, byId) => {
      await primeStoredContact();
      const replacement = { ...CONTACT_RECORD, id: "contact-2" };
      respond({ byId, contacts: biginList([replacement]) });

      const context = await lookup();

      expect(context?.contact?.id).toBe("contact-2");
      expect(toolsCalled()).toContain(BIGIN_TOOLS.SEARCH_RECORDS);
      expect(matches.repo.rows).toEqual([
        expect.objectContaining({ recordId: "contact-2" }),
      ]);
    });

    it("keeps the match when the fetch fails transiently (rate limit)", async () => {
      await primeStoredContact();
      respond({ byId: BIGIN_ERROR_RESULT });

      await expect(lookup()).rejects.toThrow(BIGIN_TOOLS.GET_SPECIFIC_RECORD);
      expect(matches.repo.rows).toEqual([
        expect.objectContaining({ recordId: "contact-1" }),
      ]);
      expect(toolsCalled()).not.toContain(BIGIN_TOOLS.SEARCH_RECORDS);
    });

    it("ignores a match made on another connection (reconnected to a different org)", async () => {
      await primeStoredContact();
      respond({
        contacts: biginList([{ ...CONTACT_RECORD, id: "other-org-1" }]),
      });

      const context = await lookup({
        server: buildServer({
          serverUrl: "https://other-456.zohomcp.com.au/mcp/other-key/message",
        }),
      });

      expect(context?.contact?.id).toBe("other-org-1");
      expect(toolsCalled()).not.toContain(BIGIN_TOOLS.GET_SPECIFIC_RECORD);
    });
  });

  describe("remembered miss", () => {
    const primeMiss = async () => {
      respond({ contacts: BIGIN_EMPTY_RESULT });
      await lookup({ email: UNKNOWN_SENDER });
      callTool.mockClear();
    };

    it("stores a miss and doesn't search again within the TTL", async () => {
      await primeMiss();

      await expect(lookup({ email: UNKNOWN_SENDER })).resolves.toBeNull();
      expect(callTool).not.toHaveBeenCalled();
      expect(matches.repo.rows).toEqual([
        expect.objectContaining({ recordId: null, displayName: null }),
      ]);
    });

    it("searches again once the miss TTL has passed", async () => {
      await primeMiss();
      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + BIGIN_MISS_TTL_MS + MILLISECONDS.MINUTE);

      await lookup({ email: UNKNOWN_SENDER });

      expect(toolsCalled()).toEqual([BIGIN_TOOLS.SEARCH_RECORDS]);
    });

    it("searches again when the user refreshes", async () => {
      await primeMiss();

      await lookup({ email: UNKNOWN_SENDER, forceRefresh: true });

      expect(toolsCalled()).toEqual([BIGIN_TOOLS.SEARCH_RECORDS]);
    });
  });
});
