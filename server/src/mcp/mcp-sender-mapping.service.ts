import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  MCPSenderLookupMapping,
  MCPServerConfig,
  MCPToolDefinition,
} from "../database/entities/mcp-server-config.entity";
import { LLMService } from "../llm/llm.service";
import { LLM_OP_DERIVE_MCP_SENDER_TOOL } from "../llm/llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "../llm/prompts";
import { safeJsonParse } from "../utils/json";

const DERIVE_TEMPERATURE = 0;
const DERIVE_MAX_TOKENS = 200;

/** Strip ```json / ``` fences an LLM may wrap JSON in. */
function stripCodeFence(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Derives — once per server — which MCP tool (and which argument) to call to look
 * up a sender by email address. The decision is cached on the server config so
 * every subsequent sender lookup is a cheap deterministic tool call (no LLM).
 */
@Injectable()
export class MCPSenderMappingService {
  private readonly logger = new Logger(MCPSenderMappingService.name);

  constructor(
    @InjectRepository(MCPServerConfig)
    private readonly configRepo: Repository<MCPServerConfig>,
    private readonly llmService: LLMService,
  ) {}

  /**
   * Ask the LLM which tool + argument to use for an email-based sender lookup and
   * persist it to `senderLookupMapping`. Returns the mapping (or null if no
   * suitable tool exists). Requires `cachedTools` to be populated already.
   */
  async deriveMapping(
    serverId: string,
    userId: string,
  ): Promise<MCPSenderLookupMapping | null> {
    const config = await this.configRepo.findOne({
      where: { id: serverId, userId },
    });
    if (!config) {
      throw new Error(`MCP server config not found: ${serverId}`);
    }

    const tools = config.cachedTools ?? [];
    if (tools.length === 0) {
      this.logger.warn(
        `No cached tools for MCP server ${serverId}; cannot derive sender mapping`,
      );
      await this.configRepo.update(serverId, { senderLookupMapping: null });
      return null;
    }

    const mapping = await this.askLLM(tools, userId);
    const valid = this.validate(mapping, tools);
    await this.configRepo.update(serverId, { senderLookupMapping: valid });
    return valid;
  }

  private async askLLM(
    tools: MCPToolDefinition[],
    userId: string,
  ): Promise<MCPSenderLookupMapping | null> {
    const prompt = getPrompt(UTILITY_PROMPT_IDS.DERIVE_MCP_SENDER_TOOL);
    if (!prompt) {
      this.logger.error("derive_mcp_sender_tool prompt not found");
      return null;
    }

    const toolsJson = JSON.stringify(
      tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      null,
      2,
    );

    const rendered = renderPrompt(prompt.prompt, { toolsJson });

    let raw: string;
    try {
      raw = await this.llmService.generateText(
        {
          prompt: rendered,
          systemPrompt: prompt.systemPrompt,
          temperature: DERIVE_TEMPERATURE,
          maxTokens: DERIVE_MAX_TOKENS,
          jsonMode: true,
        },
        undefined,
        userId,
        LLM_OP_DERIVE_MCP_SENDER_TOOL,
      );
    } catch (err) {
      this.logger.warn(
        `LLM sender-mapping derivation failed: ${(err as Error).message}`,
      );
      return null;
    }

    return safeJsonParse<MCPSenderLookupMapping | null>(
      stripCodeFence(raw),
      null,
      "derive_mcp_sender_tool",
    );
  }

  /** Reject mappings that don't reference a real tool / argument. */
  private validate(
    mapping: MCPSenderLookupMapping | null,
    tools: MCPToolDefinition[],
  ): MCPSenderLookupMapping | null {
    if (!mapping?.toolName || !mapping.emailArgName) return null;

    const tool = tools.find((candidate) => candidate.name === mapping.toolName);
    if (!tool) {
      this.logger.warn(
        `Derived sender tool "${mapping.toolName}" is not in the server's tool list`,
      );
      return null;
    }

    const schema = tool.inputSchema as {
      properties?: Record<string, unknown>;
    } | null;
    const props = schema?.properties;
    // If the schema declares properties, the chosen arg must be one of them.
    if (props && !(mapping.emailArgName in props)) {
      this.logger.warn(
        `Derived email arg "${mapping.emailArgName}" is not a property of tool "${mapping.toolName}"`,
      );
      return null;
    }

    return { toolName: mapping.toolName, emailArgName: mapping.emailArgName };
  }
}
