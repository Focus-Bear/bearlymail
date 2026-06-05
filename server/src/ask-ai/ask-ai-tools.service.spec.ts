import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import {
  MCP_SERVER_PURPOSES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "../mcp/mcp-client-manager.service";
import { AskAiToolDescriptor } from "./ask-ai.types";
import { AskAiToolService, SEARCH_EMAILS_TOOL } from "./ask-ai-tools.service";

function emailRow(partial: Partial<Email>): Email {
  return {
    id: "e1",
    from: "team@thecrmcarpenters.com",
    fromName: "The CRM Carpenters",
    subject: "Fwd: Update your AUD account details",
    body: "Please update your AUD account details.",
    receivedAt: new Date("2026-01-15T00:00:00Z"),
    threadId: "t1",
    ...partial,
  } as Email;
}

/** Chainable QueryBuilder mock whose getMany() resolves the given rows. */
function queryBuilderMock(rows: Email[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "where", "andWhere", "orderBy", "take"]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getMany = jest.fn().mockResolvedValue(rows);
  return builder;
}

describe("AskAiToolService", () => {
  let emailRepo: jest.Mocked<
    Pick<Repository<Email>, "find" | "createQueryBuilder">
  >;
  let mcpConfigRepo: jest.Mocked<Pick<Repository<MCPServerConfig>, "find">>;
  let mcpClient: jest.Mocked<
    Pick<MCPClientManagerService, "getTools" | "callTool">
  >;
  let service: AskAiToolService;

  beforeEach(() => {
    emailRepo = { find: jest.fn(), createQueryBuilder: jest.fn() };
    mcpConfigRepo = { find: jest.fn().mockResolvedValue([]) };
    mcpClient = { getTools: jest.fn(), callTool: jest.fn() };
    service = new AskAiToolService(
      emailRepo as unknown as Repository<Email>,
      mcpConfigRepo as unknown as Repository<MCPServerConfig>,
      mcpClient as unknown as MCPClientManagerService,
    );
  });

  describe("buildToolset", () => {
    it("always exposes the built-in search_emails tool", async () => {
      const { tools, registry } = await service.buildToolset("user-1");
      expect(registry.get(SEARCH_EMAILS_TOOL)).toEqual({
        kind: "search_emails",
      });
      expect(
        tools.some((tool) => tool.function.name === SEARCH_EMAILS_TOOL),
      ).toBe(true);
    });

    it("exposes enabled ask_ai MCP server tools", async () => {
      mcpConfigRepo.find.mockResolvedValue([
        { id: "srv-1", name: "Google Drive" } as MCPServerConfig,
      ]);
      mcpClient.getTools.mockResolvedValue([
        { name: "search_files", description: "Find files", inputSchema: {} },
      ]);

      const { tools, registry } = await service.buildToolset("user-1");

      expect(mcpConfigRepo.find).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          purpose: MCP_SERVER_PURPOSES.ASK_AI,
          enabled: true,
        },
      });
      // search_emails + one MCP tool
      expect(tools).toHaveLength(2);
      const mcpEntry = [...registry.values()].find(
        (desc): desc is Extract<AskAiToolDescriptor, { kind: "mcp" }> =>
          desc.kind === "mcp",
      );
      expect(mcpEntry).toMatchObject({
        serverId: "srv-1",
        serverName: "Google Drive",
        toolName: "search_files",
      });
    });

    it("skips MCP tools flagged as destructive", async () => {
      mcpConfigRepo.find.mockResolvedValue([
        { id: "srv-1", name: "Google Drive" } as MCPServerConfig,
      ]);
      mcpClient.getTools.mockResolvedValue([
        { name: "search_files", description: "Find files", inputSchema: {} },
        {
          name: "delete_file",
          description: "Delete a file",
          inputSchema: {},
          annotations: { destructiveHint: true },
        },
      ]);

      const { tools, registry } = await service.buildToolset("user-1");

      // search_emails + search_files only — delete_file is gated out.
      expect(tools).toHaveLength(2);
      expect(
        [...registry.values()].some(
          (desc) => desc.kind === "mcp" && desc.toolName === "delete_file",
        ),
      ).toBe(false);
    });
  });

  describe("executeTool — search_emails", () => {
    it("finds emails from a given sender", async () => {
      emailRepo.find.mockResolvedValue([
        emailRow({ id: "match", fromName: "The CRM Carpenters" }),
        emailRow({
          id: "other",
          from: "newsletter@example.com",
          fromName: "Example",
          subject: "Weekly digest",
        }),
      ]);

      const { resultJson, activity } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "account details", from: "carpenters" },
      );

      const parsed = JSON.parse(resultJson);
      expect(parsed.count).toBe(1);
      expect(parsed.results[0]).toMatchObject({
        emailId: "match",
        fromName: "The CRM Carpenters",
        date: "2026-01-15",
      });
      expect(activity.label).toContain("carpenters");
    });

    it("falls back to recent emails when no query tokens match", async () => {
      emailRepo.find.mockResolvedValue([emailRow({ id: "recent" })]);
      const { resultJson } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "" },
      );
      expect(JSON.parse(resultJson).count).toBe(1);
    });

    it("matches query tokens against the body and returns a snippet", async () => {
      emailRepo.find.mockResolvedValue([
        emailRow({
          id: "match",
          subject: "Quarterly update",
          body: "The reimbursement for your travel has been approved.",
        }),
        emailRow({
          id: "miss",
          subject: "Hello",
          body: "Nothing relevant here.",
        }),
      ]);

      const { resultJson } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "reimbursement" },
      );
      const parsed = JSON.parse(resultJson);
      expect(parsed.count).toBe(1);
      expect(parsed.results[0].emailId).toBe("match");
      expect(parsed.results[0].snippet).toContain("reimbursement");
    });

    it("returns only the best-scoring email per thread", async () => {
      emailRepo.find.mockResolvedValue([
        emailRow({ id: "a", threadId: "thread-1", subject: "budget review" }),
        emailRow({ id: "b", threadId: "thread-1", subject: "budget" }),
        emailRow({ id: "c", threadId: "thread-2", subject: "budget" }),
      ]);
      const { resultJson } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "budget" },
      );
      const parsed = JSON.parse(resultJson);
      // One result per thread (2 threads), not 3 emails.
      expect(parsed.count).toBe(2);
      const ids = parsed.results.map((res: { emailId: string }) => res.emailId);
      expect(ids).toContain("c");
      expect(ids).not.toContain(ids[0] === "a" ? "b" : "a");
    });

    it("searches the whole mailbox via HMAC when a full address is given", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        queryBuilderMock([
          emailRow({
            id: "m1",
            from: "team@thecrmcarpenters.com",
            threadId: "t1",
          }),
          emailRow({
            id: "m2",
            from: "someone@else.com",
            to: "team@thecrmcarpenters.com",
            threadId: "t2",
          }),
          emailRow({
            id: "noise",
            from: "x@y.com",
            to: "z@w.com",
            threadId: "t3",
          }),
        ]) as never,
      );

      const { resultJson, activity } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "", from: "team@thecrmcarpenters.com" },
      );

      const parsed = JSON.parse(resultJson);
      expect(parsed.scope).toBe("entire-mailbox");
      // m1 (sender) + m2 (recipient); the unrelated row is filtered out.
      expect(parsed.count).toBe(2);
      expect(activity.label).toContain("team@thecrmcarpenters.com");
      // Whole-mailbox path must not fall back to the recent-scan find().
      expect(emailRepo.find).not.toHaveBeenCalled();
    });

    it("uses the recent-scan path when from is a partial name, not an address", async () => {
      emailRepo.find.mockResolvedValue([emailRow({ id: "r1" })]);
      await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "", from: "carpenters" },
      );
      expect(emailRepo.find).toHaveBeenCalled();
      expect(emailRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("clamps the limit to the allowed maximum", async () => {
      emailRepo.find.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => emailRow({ id: `e${i}` })),
      );
      const { resultJson } = await service.executeTool(
        "user-1",
        { kind: "search_emails" },
        { query: "carpenters", limit: 999 },
      );
      expect(JSON.parse(resultJson).results.length).toBeLessThanOrEqual(20);
    });
  });

  describe("executeTool — MCP", () => {
    const descriptor: AskAiToolDescriptor = {
      kind: "mcp",
      serverId: "srv-1",
      serverName: "Google Drive",
      toolName: "search_files",
    };

    it("invokes the MCP tool and labels the activity", async () => {
      mcpClient.callTool.mockResolvedValue({ files: ["Q3 budget.xlsx"] });
      const { resultJson, activity } = await service.executeTool(
        "user-1",
        descriptor,
        { query: "budget" },
      );
      expect(mcpClient.callTool).toHaveBeenCalledWith("srv-1", "search_files", {
        query: "budget",
      });
      expect(JSON.parse(resultJson).files).toEqual(["Q3 budget.xlsx"]);
      expect(activity.label).toBe("Looked in Google Drive");
    });

    it("returns an error payload (not a throw) when the tool fails", async () => {
      mcpClient.callTool.mockRejectedValue(new Error("connection refused"));
      const { resultJson, activity } = await service.executeTool(
        "user-1",
        descriptor,
        {},
      );
      expect(JSON.parse(resultJson).error).toContain("connection refused");
      expect(activity.label).toContain("failed");
    });
  });
});
