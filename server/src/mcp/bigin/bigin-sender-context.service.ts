import { Injectable, Logger } from "@nestjs/common";

import {
  CRM_MATCH_KINDS,
  CrmCompanySummary,
  CrmContactSummary,
  CrmMatchKind,
  CrmSenderContext,
} from "../crm-sender-context.types";
import { MCPClientManagerService } from "../mcp-client-manager.service";
import type {
  BiginAccountRecord,
  BiginContactRecord,
  BiginDealRecord,
  BiginNoteRecord,
} from "./bigin-api.types";
import {
  contactCompany,
  emailDomain,
  isCompanyDomain,
  pickMostRecent,
  toCompanySummary,
  toContactSummary,
  toDealSummaries,
  toNoteSummaries,
  websiteHost,
} from "./bigin-context.mapper";
import { readBiginRecords } from "./bigin-records";
import {
  BIGIN_ARG_GROUPS,
  BIGIN_ARGS,
  BIGIN_FIELDS,
  BIGIN_LIMITS,
  BIGIN_MODULES,
  BIGIN_RELATED_LISTS,
  BIGIN_TOOLS,
  BiginParentModule,
  CRM_PROVIDERS,
} from "./bigin-sender-context.constants";
import { hasTool, ToolList } from "./bigin-toolset";

const FIELD_SEPARATOR = ",";

type BiginSearchQuery =
  | { [BIGIN_ARGS.EMAIL]: string }
  | { [BIGIN_ARGS.WORD]: string };

interface MatchedParent {
  module: BiginParentModule;
  matchedBy: CrmMatchKind;
  matchCount: number;
  contact: CrmContactSummary | null;
  company: CrmCompanySummary | null;
  recordId: string;
}

/**
 * Looks a sender up in Zoho Bigin with a fixed sequence of MCP tool calls — no
 * model decides which tools to call:
 *
 *   1. Contacts search by the sender's email address.
 *   2. If no contact, Accounts search by the email's domain, kept only when the
 *      account's website is exactly that domain (skipped for free-mail domains).
 *   3. That record's Deals and Notes, in parallel.
 *
 * One to four calls per uncached sender; three for a known contact. Search
 * failures throw (the caller treats the server as having no context); a failed
 * Deals/Notes call only drops that part.
 */
@Injectable()
export class BiginSenderContextService {
  private readonly logger = new Logger(BiginSenderContextService.name);

  constructor(private readonly mcpClientManager: MCPClientManagerService) {}

  async lookup(
    serverId: string,
    email: string,
    tools: ToolList,
  ): Promise<CrmSenderContext | null> {
    const parent =
      (await this.matchContact(serverId, email)) ??
      (await this.matchCompany(serverId, email));
    if (!parent) return null;

    const [deals, notes] = await Promise.all([
      hasTool(tools, BIGIN_TOOLS.GET_RELATED_LIST_RECORDS)
        ? this.fetchDeals(serverId, parent)
        : [],
      hasTool(tools, BIGIN_TOOLS.GET_NOTES_FROM_RECORD)
        ? this.fetchNotes(serverId, parent)
        : [],
    ]);

    return {
      provider: CRM_PROVIDERS.ZOHO_BIGIN,
      matchedBy: parent.matchedBy,
      matchCount: parent.matchCount,
      contact: parent.contact,
      company: parent.company,
      deals: toDealSummaries(deals),
      notes: toNoteSummaries(notes),
    };
  }

  private async matchContact(
    serverId: string,
    email: string,
  ): Promise<MatchedParent | null> {
    const contacts = await this.search<BiginContactRecord>(
      serverId,
      BIGIN_MODULES.CONTACTS,
      { [BIGIN_ARGS.EMAIL]: email },
    );
    const contact = pickMostRecent(contacts);
    if (!contact) return null;
    return {
      module: BIGIN_MODULES.CONTACTS,
      matchedBy: CRM_MATCH_KINDS.CONTACT_EMAIL,
      matchCount: contacts.length,
      contact: toContactSummary(contact),
      company: contactCompany(contact),
      recordId: contact.id,
    };
  }

  private async matchCompany(
    serverId: string,
    email: string,
  ): Promise<MatchedParent | null> {
    const domain = emailDomain(email);
    if (!domain || !isCompanyDomain(domain)) return null;

    const accounts = await this.search<BiginAccountRecord>(
      serverId,
      BIGIN_MODULES.ACCOUNTS,
      { [BIGIN_ARGS.WORD]: domain },
    );
    // A word search matches the domain anywhere in any field; only an exact
    // website match says this account is the sender's company.
    const matching = accounts.filter(
      (account) => websiteHost(account.Website) === domain,
    );
    const account = pickMostRecent(matching);
    if (!account) return null;
    return {
      module: BIGIN_MODULES.ACCOUNTS,
      matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
      matchCount: matching.length,
      contact: null,
      company: toCompanySummary(account),
      recordId: account.id,
    };
  }

  private async search<TRecord extends { id: string }>(
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

  private fetchDeals(
    serverId: string,
    parent: MatchedParent,
  ): Promise<BiginDealRecord[]> {
    return this.fetchRelated<BiginDealRecord>(
      serverId,
      BIGIN_TOOLS.GET_RELATED_LIST_RECORDS,
      {
        [BIGIN_ARG_GROUPS.PATH]: {
          [BIGIN_ARGS.MODULE]: parent.module,
          [BIGIN_ARGS.RECORD_ID]: parent.recordId,
          [BIGIN_ARGS.RELATED_LIST]: BIGIN_RELATED_LISTS.DEALS,
        },
        [BIGIN_ARG_GROUPS.QUERY]: {
          [BIGIN_ARGS.FIELDS]: BIGIN_FIELDS.DEALS.join(FIELD_SEPARATOR),
          [BIGIN_ARGS.PER_PAGE]: BIGIN_LIMITS.DEALS_FETCHED,
        },
      },
    );
  }

  private fetchNotes(
    serverId: string,
    parent: MatchedParent,
  ): Promise<BiginNoteRecord[]> {
    return this.fetchRelated<BiginNoteRecord>(
      serverId,
      BIGIN_TOOLS.GET_NOTES_FROM_RECORD,
      {
        [BIGIN_ARG_GROUPS.PATH]: {
          [BIGIN_ARGS.MODULE]: parent.module,
          [BIGIN_ARGS.RECORD_ID]: parent.recordId,
        },
        [BIGIN_ARG_GROUPS.QUERY]: {
          [BIGIN_ARGS.FIELDS]: BIGIN_FIELDS.NOTES.join(FIELD_SEPARATOR),
          [BIGIN_ARGS.PER_PAGE]: BIGIN_LIMITS.NOTES_FETCHED,
        },
      },
    );
  }

  /** Deals/notes are extras: a failure leaves them empty rather than losing the match. */
  private async fetchRelated<TRecord extends { id: string }>(
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
