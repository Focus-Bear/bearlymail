import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type OpenAI from "openai";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import {
  MCP_SERVER_PURPOSES,
  MCPServerConfig,
  MCPToolDefinition,
} from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "../mcp/mcp-client-manager.service";
import {
  buildRecipientHmacPattern,
  computeEmailHmac,
} from "../utils/hmac-email";
import {
  AskAiToolActivity,
  AskAiToolDescriptor,
  AskAiToolset,
} from "./ask-ai.types";

/** Built-in tool: search the user's own emails. */
export const SEARCH_EMAILS_TOOL = "search_emails";

/** Tool descriptor "kind" discriminants (named to satisfy lint comparisons). */
const KIND_SEARCH = "search_emails" as const;
const KIND_MCP = "mcp" as const;

/** Most recent emails scanned per search_emails call (bounds decrypt cost). */
const SEARCH_SCAN_LIMIT = 300;
/** Max rows pulled for an indexed by-sender HMAC lookup (whole-mailbox reach). */
const HMAC_SCAN_LIMIT = 200;
/** Default / max emails returned to the model from one search. */
const SEARCH_RESULTS_DEFAULT = 8;
const SEARCH_RESULTS_MAX = 20;
/** Cap MCP tools exposed to the model so the prompt stays bounded. */
const MAX_MCP_TOOLS = 24;
/** Truncate raw tool output before feeding it back to the model. */
const MAX_TOOL_RESULT_CHARS = 8000;
/** Max characters for a tool description passed to the model. */
const MAX_TOOL_DESCRIPTION_CHARS = 1024;
/** Max characters of the sanitized tool name base (before the mcp_<n>_ prefix). */
const MAX_TOOL_NAME_BASE_CHARS = 48;
const MIN_TOKEN_LENGTH = 2;
/** Length of the body snippet returned per result. */
const SNIPPET_LENGTH = 160;
/** Score weight: a query token matching the subject counts more than the body. */
const SUBJECT_MATCH_WEIGHT = 2;

interface SearchEmailsArgs {
  query?: string;
  from?: string;
  limit?: number;
}

interface ScoredEmail {
  row: Email;
  score: number;
}

/**
 * Builds the toolset offered to the Ask AI agent and executes tool calls.
 *
 * Two tool sources:
 *  - the built-in {@link SEARCH_EMAILS_TOOL}, a fast local-DB lookup over the
 *    user's synced emails (no provider sync, no nested LLM ranking); and
 *  - any MCP servers the user connected with purpose "ask_ai" (e.g. Google
 *    Drive), whose cached tools are exposed verbatim and invoked over HTTP.
 */
@Injectable()
export class AskAiToolService {
  private readonly logger = new Logger(AskAiToolService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepo: Repository<Email>,
    @InjectRepository(MCPServerConfig)
    private readonly mcpConfigRepo: Repository<MCPServerConfig>,
    private readonly mcpClient: MCPClientManagerService,
  ) {}

  /**
   * Assemble the tools available to the agent for this user, plus a registry
   * mapping each tool's function name back to how it should be executed.
   */
  async buildToolset(userId: string): Promise<AskAiToolset> {
    const registry = new Map<string, AskAiToolDescriptor>();
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      this.searchEmailsToolDefinition(),
    ];
    registry.set(SEARCH_EMAILS_TOOL, { kind: "search_emails" });

    await this.appendMcpTools(userId, tools, registry);
    return { tools, registry };
  }

  /**
   * Execute one resolved tool call and return the JSON the model should see,
   * plus a UI-facing record of what happened. Never throws: tool failures are
   * returned as an error payload so the model can recover or apologise.
   */
  async executeTool(
    userId: string,
    descriptor: AskAiToolDescriptor,
    args: Record<string, unknown>,
  ): Promise<{ resultJson: string; activity: AskAiToolActivity }> {
    try {
      if (descriptor.kind === KIND_SEARCH) {
        return this.runEmailSearch(userId, args as SearchEmailsArgs);
      }
      const result = await this.mcpClient.callTool(
        descriptor.serverId,
        descriptor.toolName,
        args,
      );
      return {
        resultJson: this.truncate(JSON.stringify(result ?? null)),
        activity: {
          tool: descriptor.toolName,
          label: `Looked in ${descriptor.serverName}`,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ask AI tool "${descriptor.kind}" failed: ${message}`);
      const activity: AskAiToolActivity =
        descriptor.kind === KIND_MCP
          ? {
              tool: descriptor.toolName,
              label: `${descriptor.serverName} lookup failed`,
            }
          : { tool: SEARCH_EMAILS_TOOL, label: "Email search failed" };
      return { resultJson: JSON.stringify({ error: message }), activity };
    }
  }

  // ── Built-in email search ──────────────────────────────────────────────────

  private searchEmailsToolDefinition(): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: SEARCH_EMAILS_TOOL,
        description:
          "Search the user's emails by topic and/or sender. To find every email " +
          "from or to a specific person, pass their full email address in `from` " +
          "— this searches the entire mailbox (all history). For topic/keyword " +
          "searches, results cover recent synced emails. Returns the best match " +
          "per thread with a short snippet.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Keywords to match against subject and body. Pass an empty string when you only care about the sender.",
            },
            from: {
              type: "string",
              description:
                "Sender/recipient filter. Pass a FULL email address (e.g. team@acme.com) to search the whole mailbox for that person; a partial name only filters recent emails.",
            },
            limit: {
              type: "integer",
              description: `Max results to return (1-${SEARCH_RESULTS_MAX}, default ${SEARCH_RESULTS_DEFAULT}).`,
            },
          },
          required: ["query"],
        },
      },
    };
  }

  private async runEmailSearch(
    userId: string,
    args: SearchEmailsArgs,
  ): Promise<{ resultJson: string; activity: AskAiToolActivity }> {
    const query = (args.query ?? "").trim();
    const fromFilter = (args.from ?? "").trim().toLowerCase();
    const limit = Math.min(
      Math.max(Math.trunc(args.limit ?? SEARCH_RESULTS_DEFAULT), 1),
      SEARCH_RESULTS_MAX,
    );

    // If `from` is a full email address, search the WHOLE mailbox via the
    // indexed HMAC fingerprint columns (same mechanism the Contacts section
    // uses), rather than the recent-emails keyword scan below.
    const address = this.extractEmailAddress(args.from);
    if (address) {
      return this.searchBySenderHmac(userId, address, query, limit);
    }

    // Repository find auto-decrypts the selected encrypted columns via the
    // TypeORM transformer; we scan the most recent emails and rank in memory.
    const rows = await this.emailRepo.find({
      where: { userId },
      order: { receivedAt: "DESC" },
      take: SEARCH_SCAN_LIMIT,
      select: {
        id: true,
        from: true,
        fromName: true,
        subject: true,
        body: true,
        receivedAt: true,
        threadId: true,
      },
    });

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH);

    const scored = rows
      .map((row) => this.scoreEmail(row, tokens, fromFilter))
      .filter((entry): entry is ScoredEmail => entry !== null)
      .sort((left, right) => right.score - left.score);

    // Keep only the best-scoring email per thread so the model isn't handed
    // several near-identical hits from one conversation.
    const byThread = new Map<string, ScoredEmail>();
    for (const entry of scored) {
      const key = entry.row.threadId || entry.row.id;
      const existing = byThread.get(key);
      if (!existing || entry.score > existing.score) {
        byThread.set(key, entry);
      }
    }

    const results = [...byThread.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ row }) => ({
        emailId: row.id,
        from: row.from ?? "",
        fromName: row.fromName ?? "",
        subject: row.subject ?? "",
        date: row.receivedAt ? row.receivedAt.toISOString().slice(0, 10) : null,
        snippet: this.snippet(row.body),
      }));

    let label = "Searched your recent emails";
    if (fromFilter) {
      label = `Searched your emails from "${args.from}"`;
    } else if (query) {
      label = `Searched your emails for "${query}"`;
    }

    return {
      resultJson: this.truncate(
        JSON.stringify({
          count: results.length,
          scannedRecentEmails: rows.length,
          results,
        }),
      ),
      activity: { tool: SEARCH_EMAILS_TOOL, label },
    };
  }

  /** Pull a bare email address out of `from` ("Name <a@b.com>" or "a@b.com"). */
  private extractEmailAddress(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!value) return null;
    const bracketed = value.match(/<([^>]+)>/);
    const candidate = (bracketed ? bracketed[1] : value).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
      ? candidate.toLowerCase()
      : null;
  }

  /**
   * Whole-mailbox search for emails involving a specific address, using the
   * indexed `senderEmailHmac` / `recipientEmailsHmac` columns (the same approach
   * as ContactsService.getContactThreads). Verifies matches against the
   * decrypted fields to guard against NULL-HMAC legacy rows and HMAC collisions.
   */
  private async searchBySenderHmac(
    userId: string,
    address: string,
    query: string,
    limit: number,
  ): Promise<{ resultJson: string; activity: AskAiToolActivity }> {
    const senderHmac = computeEmailHmac(address);
    const recipientPattern = buildRecipientHmacPattern(address);

    const rows = await this.emailRepo
      .createQueryBuilder("email")
      .select([
        "email.id",
        "email.from",
        "email.fromName",
        "email.to",
        "email.cc",
        "email.subject",
        "email.body",
        "email.receivedAt",
        "email.threadId",
        "email.senderEmailHmac",
        "email.recipientEmailsHmac",
      ])
      .where("email.userId = :userId", { userId })
      .andWhere(
        "(email.senderEmailHmac = :senderHmac OR email.recipientEmailsHmac LIKE :recipientPattern)",
        { senderHmac, recipientPattern },
      )
      .orderBy("email.receivedAt", "DESC")
      .take(HMAC_SCAN_LIMIT)
      .getMany();

    // getMany() hydrates entities, so encrypted columns are already decrypted.
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH);

    const byThread = new Map<string, ScoredEmail>();
    for (const row of rows) {
      const from = (row.from ?? "").toLowerCase();
      const to = (row.to ?? "").toLowerCase();
      const cc = (row.cc ?? "").toLowerCase();
      if (
        !from.includes(address) &&
        !to.includes(address) &&
        !cc.includes(address)
      ) {
        continue;
      }
      let score = 1;
      const subject = (row.subject ?? "").toLowerCase();
      const body = (row.body ?? "").toLowerCase();
      for (const token of tokens) {
        if (subject.includes(token)) {
          score += SUBJECT_MATCH_WEIGHT;
        } else if (body.includes(token)) {
          score += 1;
        }
      }
      const key = row.threadId || row.id;
      const existing = byThread.get(key);
      if (!existing || score > existing.score) {
        byThread.set(key, { row, score });
      }
    }

    const results = [...byThread.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ row }) => ({
        emailId: row.id,
        from: row.from ?? "",
        fromName: row.fromName ?? "",
        subject: row.subject ?? "",
        date: row.receivedAt ? row.receivedAt.toISOString().slice(0, 10) : null,
        snippet: this.snippet(row.body),
      }));

    return {
      resultJson: this.truncate(
        JSON.stringify({
          count: results.length,
          scope: "entire-mailbox",
          results,
        }),
      ),
      activity: {
        tool: SEARCH_EMAILS_TOOL,
        label: `Searched all emails with ${address}`,
      },
    };
  }

  /** Score one email against the query tokens and optional sender filter. */
  private scoreEmail(
    row: Email,
    tokens: string[],
    fromFilter: string,
  ): ScoredEmail | null {
    const sender = `${row.from ?? ""} ${row.fromName ?? ""}`.toLowerCase();
    if (fromFilter && !sender.includes(fromFilter)) {
      return null;
    }
    const subject = (row.subject ?? "").toLowerCase();
    const body = (row.body ?? "").toLowerCase();

    let score = fromFilter ? 1 : 0;
    for (const token of tokens) {
      if (subject.includes(token)) {
        score += SUBJECT_MATCH_WEIGHT;
      } else if (sender.includes(token) || body.includes(token)) {
        score += 1;
      }
    }
    // With no usable query tokens and no sender filter, fall back to recency.
    if (tokens.length === 0 && !fromFilter) {
      score = 1;
    }
    return score > 0 ? { row, score } : null;
  }

  /** A short, whitespace-collapsed excerpt of the email body. */
  private snippet(body: string | null | undefined): string {
    const collapsed = (body ?? "").replace(/\s+/g, " ").trim();
    return collapsed.length > SNIPPET_LENGTH
      ? `${collapsed.slice(0, SNIPPET_LENGTH)}…`
      : collapsed;
  }

  // ── MCP-connected tools ─────────────────────────────────────────────────────

  private async appendMcpTools(
    userId: string,
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    registry: Map<string, AskAiToolDescriptor>,
  ): Promise<void> {
    const servers = await this.mcpConfigRepo.find({
      where: { userId, purpose: MCP_SERVER_PURPOSES.ASK_AI, enabled: true },
    });

    let index = 0;
    for (const server of servers) {
      let definitions: MCPToolDefinition[];
      try {
        definitions = await this.mcpClient.getTools(server.id);
      } catch (error) {
        this.logger.warn(
          `Skipping Ask AI MCP server ${server.id}: ${(error as Error).message}`,
        );
        continue;
      }

      for (const def of definitions) {
        // Keep known-destructive tools away from the autonomous assistant.
        if (def.annotations?.destructiveHint === true) {
          this.logger.log(
            `Ask AI: skipping destructive MCP tool "${def.name}" on ${server.name}`,
          );
          continue;
        }
        if (registry.size > MAX_MCP_TOOLS) {
          this.logger.warn(
            `Ask AI MCP tool cap (${MAX_MCP_TOOLS}) reached; remaining tools skipped`,
          );
          return;
        }
        const fnName = this.safeFunctionName(def.name, index++, registry);
        tools.push({
          type: "function",
          function: {
            name: fnName,
            description: `[${server.name}] ${def.description}`.slice(
              0,
              MAX_TOOL_DESCRIPTION_CHARS,
            ),
            parameters: (def.inputSchema as Record<string, unknown>) ?? {
              type: "object",
              properties: {},
            },
          },
        });
        registry.set(fnName, {
          kind: "mcp",
          serverId: server.id,
          serverName: server.name,
          toolName: def.name,
        });
      }
    }
  }

  /** OpenAI function names must match ^[a-zA-Z0-9_-]{1,64}$ and be unique. */
  private safeFunctionName(
    toolName: string,
    index: number,
    registry: Map<string, AskAiToolDescriptor>,
  ): string {
    const cleaned = toolName
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, MAX_TOOL_NAME_BASE_CHARS);
    let name = `mcp_${index}_${cleaned}`;
    let suffix = 0;
    while (registry.has(name)) {
      name = `mcp_${index}_${cleaned}_${++suffix}`;
    }
    return name;
  }

  private truncate(value: string): string {
    return value.length > MAX_TOOL_RESULT_CHARS
      ? `${value.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`
      : value;
  }
}
