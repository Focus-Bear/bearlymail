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
import { BIGIN_TOOLS } from "./bigin/bigin-sender-context.constants";
import { BiginSenderContextService } from "./bigin/bigin-sender-context.service";
import { isBiginToolset } from "./bigin/bigin-toolset";
import { formatCrmSenderContext } from "./crm-sender-context.format";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { extractMcpText } from "./mcp-tool-result";

/**
 * How long a cached sender-context result is considered fresh, per user and
 * sender. Misses and failures are cached too, so a rate-limited or unknown
 * sender isn't re-queried on every open; the card's refresh button bypasses it.
 */
const SENDER_CONTEXT_TTL_MS = MILLISECONDS.HOUR;

/** One sender lookup across the user's sender-context servers. */
interface SenderLookup {
  userId: string;
  email: string;
  forceRefresh: boolean;
}

export interface SenderContextResult {
  entries: MCPSenderContextEntry[];
  fetchedAt: string;
  /** True when the result came from a fresh MCP call rather than the cache. */
  fromCache: boolean;
}

/**
 * Fetches context about an email sender from the user's sender-context MCP
 * servers (e.g. HubSpot CRM). No model is involved per sender: Zoho Bigin gets
 * a fixed contact → deals/notes lookup (the matched record is remembered, see
 * CrmSenderMatchStore), any other server a single call to its pre-derived
 * lookup mapping.
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
    private readonly biginSenderContext: BiginSenderContextService,
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

    const entries = await this.fetchFromServers({
      userId,
      email,
      forceRefresh,
    });
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
    lookup: SenderLookup,
  ): Promise<MCPSenderContextEntry[]> {
    const servers = await this.configRepo.find({
      where: {
        userId: lookup.userId,
        purpose: MCP_SERVER_PURPOSES.SENDER_CONTEXT,
        enabled: true,
      },
    });

    const usable = servers.filter(
      (server) =>
        isBiginToolset(server.cachedTools) || server.senderLookupMapping,
    );

    const results = await Promise.all(
      usable.map((server) => this.querySingleServer(server, lookup)),
    );

    return results.filter(
      (entry): entry is MCPSenderContextEntry => entry !== null,
    );
  }

  private async querySingleServer(
    server: MCPServerConfig,
    lookup: SenderLookup,
  ): Promise<MCPSenderContextEntry | null> {
    try {
      return isBiginToolset(server.cachedTools)
        ? await this.queryBigin(server, lookup)
        : await this.queryMappedTool(server, lookup.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Sender-context lookup failed on server ${server.id}: ${message}`,
      );
      return null;
    }
  }

  private async queryBigin(
    server: MCPServerConfig,
    lookup: SenderLookup,
  ): Promise<MCPSenderContextEntry | null> {
    const crm = await this.biginSenderContext.lookup({ server, ...lookup });
    if (!crm) return null;
    return {
      serverId: server.id,
      serverName: server.name,
      toolName: BIGIN_TOOLS.SEARCH_RECORDS,
      text: formatCrmSenderContext(crm),
      crm,
    };
  }

  private async queryMappedTool(
    server: MCPServerConfig,
    email: string,
  ): Promise<MCPSenderContextEntry | null> {
    const mapping = server.senderLookupMapping;
    if (!mapping) return null;

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
  }

  /** Text parts of an MCP tools/call result, or its JSON for other shapes. */
  private extractText(output: unknown): string {
    const text = extractMcpText(output);
    if (text) return text;
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
