import { Injectable } from "@nestjs/common";

import type { CrmSenderMatch } from "../../database/entities/crm-sender-match.entity";
import type { MCPServerConfig } from "../../database/entities/mcp-server-config.entity";
import { EncryptionHelper } from "../../encryption/encryption.helper";
import type { CrmSenderContext } from "../crm-sender-context.types";
import {
  connectionFingerprint,
  CrmSenderMatchKey,
  CrmSenderMatchStore,
} from "../crm-sender-match.store";
import type { BiginAccountRecord, BiginContactRecord } from "./bigin-api.types";
import {
  emailDomain,
  isCompanyDomain,
  pickMostRecent,
  toDealSummaries,
  toNoteSummaries,
} from "./bigin-context.mapper";
import {
  companyParent,
  contactParent,
  isParentModule,
  isSendersCompany,
  isSendersContact,
  MatchedParent,
  toRecordMatch,
} from "./bigin-parent";
import { biginRecordUrl } from "./bigin-record-url";
import { BiginRecordsClient } from "./bigin-records.client";
import {
  BIGIN_ARGS,
  BIGIN_MISS_TTL_MS,
  BIGIN_MODULES,
  BIGIN_TOOLS,
  CRM_PROVIDERS,
} from "./bigin-sender-context.constants";
import { hasTool } from "./bigin-toolset";

export interface BiginLookupRequest {
  server: MCPServerConfig;
  userId: string;
  email: string;
  /** The user asked for fresh data: don't trust a remembered "not found". */
  forceRefresh: boolean;
}

/**
 * Resolves a sender to a Zoho Bigin record with fixed MCP tool calls — no
 * model decides which tools to call — and remembers the result per user and
 * connection:
 *
 *   - A stored match is fetched by ID and re-checked against the sender; if
 *     Bigin says the record is gone (or it no longer matches), the match is
 *     forgotten and we search again.
 *   - A stored miss is trusted for BIGIN_MISS_TTL_MS.
 *   - Otherwise: Contacts search by email, then Accounts by the email domain
 *     (exact website match only, never for free-mail domains).
 *
 * Then that record's Deals and Notes, in parallel. Search and fetch-by-ID
 * failures throw (the caller shows no context, the stored match is kept); a
 * failed Deals/Notes call only drops that part.
 */
@Injectable()
export class BiginSenderContextService {
  constructor(
    private readonly records: BiginRecordsClient,
    private readonly matchStore: CrmSenderMatchStore,
  ) {}

  async lookup(request: BiginLookupRequest): Promise<CrmSenderContext | null> {
    const parent = await this.resolveParent(request);
    if (!parent) return null;

    const { server } = request;
    const tools = server.cachedTools;
    const [deals, notes] = await Promise.all([
      hasTool(tools, BIGIN_TOOLS.GET_RELATED_LIST_RECORDS)
        ? this.records.deals(server.id, parent)
        : [],
      hasTool(tools, BIGIN_TOOLS.GET_NOTES_FROM_RECORD)
        ? this.records.notes(server.id, parent)
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
      recordUrl: biginRecordUrl(server, parent.module, parent.recordId),
    };
  }

  private async resolveParent(
    request: BiginLookupRequest,
  ): Promise<MatchedParent | null> {
    const { server, userId, email } = request;
    const key: CrmSenderMatchKey = {
      userId,
      serverId: server.id,
      emailHash: EncryptionHelper.hashEmail(email),
    };
    const fingerprint = connectionFingerprint(server);
    const stored = await this.matchStore.find(key, fingerprint);
    const canFetchById = hasTool(
      server.cachedTools,
      BIGIN_TOOLS.GET_SPECIFIC_RECORD,
    );

    if (stored?.recordId && canFetchById) {
      const parent = await this.loadStoredParent(server.id, stored, email);
      if (parent) return parent;
      await this.matchStore.forget(key);
    } else if (
      stored &&
      !stored.recordId &&
      !request.forceRefresh &&
      this.isFreshMiss(stored)
    ) {
      return null;
    }

    const found =
      (await this.searchContact(server.id, email)) ??
      (await this.searchCompany(server.id, email));
    if (found) {
      await this.matchStore.saveMatch(key, fingerprint, toRecordMatch(found));
    } else {
      await this.matchStore.saveMiss(key, fingerprint);
    }
    return found;
  }

  /** The stored record if it still exists and still belongs to this sender. */
  private async loadStoredParent(
    serverId: string,
    stored: CrmSenderMatch,
    email: string,
  ): Promise<MatchedParent | null> {
    const { recordModule, recordId } = stored;
    if (!recordId || !isParentModule(recordModule)) return null;

    const ref = { module: recordModule, recordId };
    if (recordModule === BIGIN_MODULES.CONTACTS) {
      const contact = await this.records.getById<BiginContactRecord>(
        serverId,
        ref,
      );
      return contact && isSendersContact(contact, email)
        ? contactParent(contact, stored.matchCount)
        : null;
    }
    const account = await this.records.getById<BiginAccountRecord>(
      serverId,
      ref,
    );
    return account && isSendersCompany(account, email)
      ? companyParent(account, stored.matchCount)
      : null;
  }

  private isFreshMiss(stored: CrmSenderMatch): boolean {
    return Date.now() - stored.matchedAt.getTime() < BIGIN_MISS_TTL_MS;
  }

  private async searchContact(
    serverId: string,
    email: string,
  ): Promise<MatchedParent | null> {
    const contacts = await this.records.search<BiginContactRecord>(
      serverId,
      BIGIN_MODULES.CONTACTS,
      { [BIGIN_ARGS.EMAIL]: email },
    );
    const contact = pickMostRecent(contacts);
    return contact ? contactParent(contact, contacts.length) : null;
  }

  private async searchCompany(
    serverId: string,
    email: string,
  ): Promise<MatchedParent | null> {
    const domain = emailDomain(email);
    if (!domain || !isCompanyDomain(domain)) return null;

    const accounts = await this.records.search<BiginAccountRecord>(
      serverId,
      BIGIN_MODULES.ACCOUNTS,
      { [BIGIN_ARGS.WORD]: domain },
    );
    // A word search matches the domain anywhere in any field; only an exact
    // website match says this account is the sender's company.
    const matching = accounts.filter((account) =>
      isSendersCompany(account, email),
    );
    const account = pickMostRecent(matching);
    return account ? companyParent(account, matching.length) : null;
  }
}
