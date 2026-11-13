import { CRM_MATCH_KINDS } from "../crm-sender-context.types";
import { MCPClientManagerService } from "../mcp-client-manager.service";
import {
  ACCOUNT_RECORD,
  ALL_BIGIN_TOOLS,
  BIGIN_EMPTY_RESULT,
  BIGIN_ERROR_RESULT,
  biginList,
  CLOSED_DEAL,
  CONTACT_RECORD,
  NOTE_RECORD,
  OPEN_DEAL,
} from "./__fixtures__/bigin.fixture";
import {
  BIGIN_ARG_GROUPS,
  BIGIN_MODULES,
  BIGIN_TOOLS,
  CRM_PROVIDERS,
} from "./bigin-sender-context.constants";
import { BiginSenderContextService } from "./bigin-sender-context.service";

const SERVER_ID = "server-1";
const SENDER = "ada@acme.example";

type ToolArgs = Record<string, Record<string, unknown>>;

describe("BiginSenderContextService", () => {
  let callTool: jest.Mock;
  let service: BiginSenderContextService;

  /** Answer each tool (and, for search, each module) with a fixed result. */
  const respond = (results: {
    contacts?: unknown;
    accounts?: unknown;
    deals?: unknown;
    notes?: unknown;
  }) =>
    callTool.mockImplementation(
      (_serverId: string, toolName: string, args: ToolArgs) => {
        const module = args[BIGIN_ARG_GROUPS.PATH].module_api_name;
        const byTool: Record<string, unknown> = {
          [BIGIN_TOOLS.SEARCH_RECORDS]:
            module === BIGIN_MODULES.CONTACTS
              ? results.contacts
              : results.accounts,
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

  beforeEach(() => {
    callTool = jest.fn();
    service = new BiginSenderContextService({
      callTool,
    } as unknown as MCPClientManagerService);
  });

  it("looks up contact, deals and notes with fixed calls — no tool choice", async () => {
    respond({
      contacts: biginList([CONTACT_RECORD]),
      deals: biginList([CLOSED_DEAL, OPEN_DEAL]),
      notes: biginList([NOTE_RECORD]),
    });

    const context = await service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS);

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
    });
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool).toHaveBeenCalledWith(
      SERVER_ID,
      BIGIN_TOOLS.SEARCH_RECORDS,
      {
        path_variables: { module_api_name: "Contacts" },
        query_params: { email: SENDER },
      },
    );
    expect(callTool).toHaveBeenCalledWith(
      SERVER_ID,
      BIGIN_TOOLS.GET_RELATED_LIST_RECORDS,
      expect.objectContaining({
        path_variables: {
          module_api_name: "Contacts",
          id: "contact-1",
          related_list_api_name: "Deals",
        },
      }),
    );
  });

  it("uses the most recently modified contact when several match", async () => {
    const stale = {
      ...CONTACT_RECORD,
      id: "contact-0",
      Modified_Time: "2020-01-01T00:00:00Z",
    };
    respond({ contacts: biginList([stale, CONTACT_RECORD]) });

    const context = await service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS);

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
      deals: biginList([OPEN_DEAL]),
    });

    const context = await service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS);

    expect(context).toMatchObject({
      matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
      matchCount: 1,
      contact: null,
      company: { id: "account-1", name: "Acme" },
    });
    expect(callTool).toHaveBeenCalledWith(
      SERVER_ID,
      BIGIN_TOOLS.SEARCH_RECORDS,
      {
        path_variables: { module_api_name: "Accounts" },
        query_params: { word: "acme.example" },
      },
    );
  });

  it("returns null without a company search for a free-mail sender", async () => {
    respond({ contacts: BIGIN_EMPTY_RESULT });

    await expect(
      service.lookup(SERVER_ID, "someone@gmail.com", ALL_BIGIN_TOOLS),
    ).resolves.toBeNull();
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("returns null when no account's website matches the domain", async () => {
    respond({
      contacts: BIGIN_EMPTY_RESULT,
      accounts: biginList([{ ...ACCOUNT_RECORD, Website: "other.example" }]),
    });

    await expect(
      service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS),
    ).resolves.toBeNull();
    expect(toolsCalled()).toEqual([
      BIGIN_TOOLS.SEARCH_RECORDS,
      BIGIN_TOOLS.SEARCH_RECORDS,
    ]);
  });

  it("propagates a search failure (rate limit) so the caller can fall back", async () => {
    respond({ contacts: BIGIN_ERROR_RESULT });

    await expect(
      service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS),
    ).rejects.toThrow(BIGIN_TOOLS.SEARCH_RECORDS);
  });

  it("keeps the contact when deals or notes fail", async () => {
    respond({
      contacts: biginList([CONTACT_RECORD]),
      deals: new Error("HTTP 429"),
      notes: BIGIN_ERROR_RESULT,
    });

    const context = await service.lookup(SERVER_ID, SENDER, ALL_BIGIN_TOOLS);

    expect(context?.contact?.id).toBe("contact-1");
    expect(context?.deals).toEqual([]);
    expect(context?.notes).toEqual([]);
  });

  it("skips deals and notes when the server doesn't expose those tools", async () => {
    respond({ contacts: biginList([CONTACT_RECORD]) });

    const context = await service.lookup(SERVER_ID, SENDER, [
      { name: BIGIN_TOOLS.SEARCH_RECORDS },
    ]);

    expect(context?.contact?.id).toBe("contact-1");
    expect(toolsCalled()).toEqual([BIGIN_TOOLS.SEARCH_RECORDS]);
  });
});
