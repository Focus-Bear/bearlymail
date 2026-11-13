import { Injectable, Logger } from "@nestjs/common";

import { MCPClientManagerService } from "../mcp-client-manager.service";
import type { BiginDealRecord, BiginNoteRecord } from "./bigin-api.types";
import { BiginToolError, readBiginRecords } from "./bigin-records";
import {
  BIGIN_ARG_GROUPS,
  BIGIN_ARGS,
  BIGIN_FIELDS,
  BIGIN_LIMITS,
  BIGIN_RELATED_LISTS,
  BIGIN_TOOLS,
  BiginParentModule,
} from "./bigin-sender-context.constants";

const FIELD_SEPARATOR = ",";

export type BiginSearchQuery =
  | { [BIGIN_ARGS.EMAIL]: string }
  | { [BIGIN_ARGS.WORD]: string };

export interface BiginRecordRef {
  module: BiginParentModule;
  recordId: string;
}

/**
 * The fixed Zoho Bigin MCP tool calls behind sender context. Each method is
 * one tools/call with hard-coded arguments; nothing here is model-chosen.
 */
@Injectable()
export class BiginRecordsClient {
  private readonly logger = new Logger(BiginRecordsClient.name);

  constructor(private readonly mcpClientManager: MCPClientManagerService) {}

  async search<TRecord extends { id: string }>(
    serverId: string,
    module: BiginParentModule,
    query: BiginSearchQuery,
  ): Promise<TRecord[]> {
    const output = await this.mcpClientManager.callTool(
      serverId,
      BIGIN_TOOLS.SEARCH_RECORDS,
      {
        [BIGIN_ARG_GROUPS.PATH]: { [BIGIN_ARGS.MODULE]: module },
        [BIGIN_ARG_GROUPS.QUERY]: query,
      },
    );
    return readBiginRecords<TRecord>(BIGIN_TOOLS.SEARCH_RECORDS, output);
  }

  /**
   * One record by ID, or null when it no longer exists (deleted or merged).
   * Any other failure throws, so a rate limit never discards a stored match.
   */
  async getById<TRecord extends { id: string }>(
    serverId: string,
    ref: BiginRecordRef,
  ): Promise<TRecord | null> {
    const output = await this.mcpClientManager.callTool(
      serverId,
      BIGIN_TOOLS.GET_SPECIFIC_RECORD,
      {
        [BIGIN_ARG_GROUPS.PATH]: {
          [BIGIN_ARGS.MODULE]: ref.module,
          [BIGIN_ARGS.RECORD_ID]: ref.recordId,
        },
      },
    );
    try {
      const [record] = readBiginRecords<TRecord>(
        BIGIN_TOOLS.GET_SPECIFIC_RECORD,
        output,
      );
      return record ?? null;
    } catch (err) {
      if (err instanceof BiginToolError && err.isRecordGone) return null;
      throw err;
    }
  }

  deals(serverId: string, ref: BiginRecordRef): Promise<BiginDealRecord[]> {
    return this.related<BiginDealRecord>(
      serverId,
      BIGIN_TOOLS.GET_RELATED_LIST_RECORDS,
      {
        [BIGIN_ARG_GROUPS.PATH]: {
          [BIGIN_ARGS.MODULE]: ref.module,
          [BIGIN_ARGS.RECORD_ID]: ref.recordId,
          [BIGIN_ARGS.RELATED_LIST]: BIGIN_RELATED_LISTS.DEALS,
        },
        [BIGIN_ARG_GROUPS.QUERY]: {
          [BIGIN_ARGS.FIELDS]: BIGIN_FIELDS.DEALS.join(FIELD_SEPARATOR),
          [BIGIN_ARGS.PER_PAGE]: BIGIN_LIMITS.DEALS_FETCHED,
        },
      },
    );
  }

  notes(serverId: string, ref: BiginRecordRef): Promise<BiginNoteRecord[]> {
    return this.related<BiginNoteRecord>(
      serverId,
      BIGIN_TOOLS.GET_NOTES_FROM_RECORD,
      {
        [BIGIN_ARG_GROUPS.PATH]: {
          [BIGIN_ARGS.MODULE]: ref.module,
          [BIGIN_ARGS.RECORD_ID]: ref.recordId,
        },
        [BIGIN_ARG_GROUPS.QUERY]: {
          [BIGIN_ARGS.FIELDS]: BIGIN_FIELDS.NOTES.join(FIELD_SEPARATOR),
          [BIGIN_ARGS.PER_PAGE]: BIGIN_LIMITS.NOTES_FETCHED,
        },
      },
    );
  }

  /** Deals/notes are extras: a failure leaves them empty rather than losing the match. */
  private async related<TRecord extends { id: string }>(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TRecord[]> {
    try {
      const output = await this.mcpClientManager.callTool(
        serverId,
        toolName,
        args,
      );
      return readBiginRecords<TRecord>(toolName, output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Bigin ${toolName} failed on server ${serverId}: ${message}`,
      );
      return [];
    }
  }
}
