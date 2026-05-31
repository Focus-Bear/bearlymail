import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import {
  MCPSenderContextCache,
  MCPSenderContextEntry,
} from "../database/entities/mcp-sender-context-cache.entity";
import {
  MCP_SERVER_PURPOSES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { MCPClientManagerService } from "./mcp-client-manager.service";

/** How long a cached sender-context result is considered fresh. */
const SENDER_CONTEXT_TTL_MS = MILLISECONDS.HOUR;

/** MCP tools/call content-part discriminator for a plain-text part. */
const TEXT_CONTENT_TYPE = "text";

export interface SenderContextResult {
  entries: MCPSenderContextEntry[];
  fetchedAt: string;
  /** True when the result came from a fresh MCP call rather than the cache. */
  fromCache: boolean;
}

/**
 * Fetches context about an email sender from the user's sender-context MCP
 * servers (e.g. HubSpot CRM), using each server's pre-derived lookup mapping.
 *
 * Results are cached per sender (encrypted, 1h TTL) so repeat opens of the same
 * sender are cheap and don't re-hit the external CRM.
 */
@Injectable()
export class MCPSenderContextService {
  private readonly logger = new Logger(MCPSenderContextService.name);

  constructor(
    @InjectRepository(MCPServerConfig)
    private readonly configRepo: Repository<MCPServerConfig>,
    @InjectRepository(MCPSenderContextCache)
    private readonly cacheRepo: Repository<MCPSenderContextCache>,
    private readonly mcpClientManager: MCPClientManagerService,
  ) {}

  async getSenderContext(
    userId: string,
    email: string,
    forceRefresh = false,
  ): Promise<SenderContextResult> {
    if (!email) {
      return {
        entries: [],
        fetchedAt: new Date().toISOString(),
        fromCache: false,
      };
    }
    const emailHash = EncryptionHelper.hashEmail(email);

    if (!forceRefresh) {
      const cached = await this.cacheRepo.findOne({
        where: { userId, emailHash },
      });
      if (cached && this.isFresh(cached.fetchedAt)) {
        return {
          entries: cached.entries ?? [],
          fetchedAt: cached.fetchedAt.toISOString(),
          fromCache: true,
        };
      }
    }

    const entries = await this.fetchFromServers(userId, email);
    await this.upsertCache(userId, emailHash, entries);

    return {
      entries,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  }

  private isFresh(fetchedAt: Date): boolean {
    return Date.now() - fetchedAt.getTime() < SENDER_CONTEXT_TTL_MS;
  }

  private async fetchFromServers(
    userId: string,
    email: string,
  ): Promise<MCPSenderContextEntry[]> {
    const servers = await this.configRepo.find({
      where: {
        userId,
        purpose: MCP_SERVER_PURPOSES.SENDER_CONTEXT,
        enabled: true,
      },
    });

    const usable = servers.filter((server) => server.senderLookupMapping);

    const results = await Promise.all(
      usable.map((server) => this.querySingleServer(server, email)),
    );

    return results.filter(
      (entry): entry is MCPSenderContextEntry => entry !== null,
    );
  }

  private async querySingleServer(
    server: MCPServerConfig,
    email: string,
  ): Promise<MCPSenderContextEntry | null> {
    const mapping = server.senderLookupMapping;
    if (!mapping) return null;

    try {
      const output = await this.mcpClientManager.callTool(
        server.id,
        mapping.toolName,
        { [mapping.emailArgName]: email },
      );
      const text = this.extractText(output);
      if (!text) return null;

      return {
        serverId: server.id,
        serverName: server.name,
        toolName: mapping.toolName,
        text,
      };
    } catch (err) {
      this.logger.warn(
        `Sender-context lookup failed on server ${server.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Pull human-readable text out of an MCP tools/call result. The MCP spec returns
   * `{ content: [{ type: "text", text }, ...] }`; fall back to JSON for other shapes.
   */
  private extractText(output: unknown): string {
    if (typeof output === "string") return output;
    const result = output as {
      content?: Array<{ type?: string; text?: string }>;
    };
    if (Array.isArray(result?.content)) {
      const text = result.content
        .filter(
          (part) =>
            part?.type === TEXT_CONTENT_TYPE && typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) return text;
    }
    if (output == null) return "";
    return JSON.stringify(output);
  }

  private async upsertCache(
    userId: string,
    emailHash: string,
    entries: MCPSenderContextEntry[],
  ): Promise<void> {
    // Atomic upsert avoids the SELECT-then-INSERT race where two concurrent
    // opens of the same sender both miss the cache and try to insert.
    await this.cacheRepo.upsert(
      { userId, emailHash, entries, fetchedAt: new Date() },
      ["userId", "emailHash"],
    );
  }
}
