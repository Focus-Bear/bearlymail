import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import {
  buildRecipientHmacPattern,
  computeEmailHmac,
} from "../utils/hmac-email";
import { logError } from "../utils/logger";
import { ContactCrmService } from "./contact-crm.service";
import {
  compareContactMatches,
  evaluateContactQueryMatch,
  RankableContactMatch,
} from "./contact-query-match";
import { RawContact } from "./interfaces/contact-provider.interface";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { Office365ContactsProvider } from "./providers/office365-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

/** Which role the contact plays in a given thread. */
export type ContactThreadRole = "from" | "to" | "cc";

export interface ContactThreadSummary {
  emailThreadId: string;
  threadId: string;
  subject: string | null;
  /** Decrypted sender address of the latest email in the thread. */
  from: string | null;
  fromName: string | null;
  receivedAt: Date;
  isRead: boolean;
  /** Whether the contact appears as the sender, a direct recipient, or a CC recipient. */
  role: ContactThreadRole;
}

export interface ContactSearchResult {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
  isFavorite: boolean;
  contactFrequency: number;
  contactType?: string | null;
  followUpDate?: string | null;
  phone?: string | null;
  /** True when the contact has a local DB record (UUID id). False for Gmail-only results whose id is a Google People API resource name (e.g. "people/c12345"). */
  isLocal: boolean;
}

/** Live Gmail / Office 365 matches merged into each local contact search. */
const PROVIDER_SEARCH_PAGE_SIZE = 10;

/** A search hit plus the signals `compareContactMatches` ranks it by. */
interface RankedSearchResult extends RankableContactMatch {
  result: ContactSearchResult;
}

export interface ContactDetailResult extends ContactSearchResult {
  notes: {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }[];
  customFields: {
    fieldId: string;
    fieldName: string;
    fieldType: string;
    value: string | null;
    options?: string[];
  }[];
  deals: {
    id: string;
    title: string;
    value: number | null;
    stageName: string | null;
  }[];
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private gmailContactsProvider: GmailContactsProvider,
    private office365ContactsProvider: Office365ContactsProvider,
    private contactCrmService: ContactCrmService,
  ) {}

  /**
   * Sync contacts from all connected providers
   */

  async syncContacts(
    userId: string,
    _fullSync: boolean = false,
  ): Promise<{ synced: number; provider: string }[]> {
    const results: { synced: number; provider: string }[] = [];

    // Sync from Gmail if connected
    if (await this.gmailContactsProvider.isConnected(userId)) {
      try {
        const rawContacts =
          await this.gmailContactsProvider.fetchAllContacts(userId);
        const synced = await this.upsertContacts(userId, "gmail", rawContacts);
        results.push({ synced, provider: "gmail" });
      } catch (error) {
        logError(
          "Gmail contact sync failed",
          error instanceof Error ? error : new Error(String(error)),
        );
        results.push({ synced: 0, provider: "gmail" });
      }
    }

    // Sync from Office 365 (Outlook) if connected
    if (await this.office365ContactsProvider.isConnected(userId)) {
      try {
        const rawContacts =
          await this.office365ContactsProvider.fetchAllContacts(userId);
        const synced = await this.upsertContacts(
          userId,
          "office365",
          rawContacts,
        );
        results.push({ synced, provider: "office365" });
      } catch (error) {
        logError(
          "Office 365 contact sync failed",
          error instanceof Error ? error : new Error(String(error)),
        );
        results.push({ synced: 0, provider: "office365" });
      }
    }

    return results;
  }

  /**
   * Upsert contacts from a provider, generating search indexes
   */
  private async upsertContacts(
    userId: string,
    provider: string,
    rawContacts: RawContact[],
  ): Promise<number> {
    let upserted = 0;

    for (const raw of rawContacts) {
      try {
        const emailHash = SearchIndexHelper.hashExact(raw.email);

        // Generate search tokens from name, email parts, company
        const searchTokens = SearchIndexHelper.generateSearchTokens(
          raw.name,
          raw.firstName,
          raw.lastName,
          raw.company,
          SearchIndexHelper.extractEmailLocalPart(raw.email),
          SearchIndexHelper.extractEmailDomain(raw.email),
        );

        // Try to find existing contact
        const existing = await this.contactRepository.findOne({
          where: {
            userId,
            provider,
            providerId: raw.providerId,
          },
        });

        let savedContactId: string;

        if (existing) {
          // Update existing contact
          await this.contactRepository.update(existing.id, {
            email: raw.email,
            name: raw.name,
            firstName: raw.firstName,
            lastName: raw.lastName,
            phone: raw.phone,
            company: raw.company,
            jobTitle: raw.jobTitle,
            photoUrl: raw.photoUrl,
            emailHash,
            searchTokens: JSON.stringify(searchTokens),
            lastSyncedAt: new Date(),
          });
          savedContactId = existing.id;
        } else {
          // Create new contact
          const created = await this.contactRepository.save({
            userId,
            provider,
            providerId: raw.providerId,
            email: raw.email,
            name: raw.name,
            firstName: raw.firstName,
            lastName: raw.lastName,
            phone: raw.phone,
            company: raw.company,
            jobTitle: raw.jobTitle,
            photoUrl: raw.photoUrl,
            emailHash,
            searchTokens: JSON.stringify(searchTokens),
            lastSyncedAt: new Date(),
          });
          savedContactId = created.id;
        }

        // Backfill senderContactId on emails already ingested for this contact
        const contactEmailHmac = computeEmailHmac(raw.email);
        if (contactEmailHmac) {
          await this.emailRepository
            .createQueryBuilder()
            .update()
            .set({ senderContactId: savedContactId })
            .where(
              '"userId" = :userId AND "senderEmailHmac" = :hmac AND "senderContactId" IS NULL',
              { userId, hmac: contactEmailHmac },
            )
            .execute();
        }

        upserted++;
      } catch (error) {
        logError(
          `Error upserting contact ${raw.email}`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    this.logger.log(
      `Upserted ${upserted} contacts for user ${userId} from ${provider}`,
    );
    return upserted;
  }

  /**
   * Search contacts using blind index
   * Returns decrypted contacts matching the query
   */
  async searchContacts(
    userId: string,
    query: string,
    limit: number = 20,
  ): Promise<ContactSearchResult[]> {
    if (!query || query.length < 2) {
      // Return recent/frequent contacts if no query
      return this.getFrequentContacts(userId, limit);
    }

    // Check for exact email match first
    const emailHash = SearchIndexHelper.hashExact(query);
    const exactMatch = await this.contactRepository.findOne({
      where: { userId, emailHash },
    });

    if (exactMatch) {
      return [this.toSearchResult(exactMatch)];
    }

    const queryTokens = SearchIndexHelper.generateQueryTokens(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const contacts = await this.fetchSearchCandidates(
      userId,
      queryTokens,
      limit,
    );
    const [gmailResults, office365Results] = await Promise.all([
      this.gmailContactsProvider.searchContacts(
        userId,
        query,
        PROVIDER_SEARCH_PAGE_SIZE,
      ),
      this.office365ContactsProvider.searchContacts(
        userId,
        query,
        PROVIDER_SEARCH_PAGE_SIZE,
      ),
    ]);

    // Every candidate — local first so the local record (with frequency data)
    // wins the email dedupe — is matched against its visible fields and only
    // then ranked and truncated. Truncating before matching dropped genuine
    // matches that ranked below the cut (#2030).
    const ranked: RankedSearchResult[] = [];
    const seenEmails = new Set<string>();
    for (const contact of contacts) {
      const match = evaluateContactQueryMatch(contact, query);
      if (!match.passes) continue;
      seenEmails.add(contact.email.toLowerCase());
      ranked.push({
        result: this.toSearchResult(contact),
        tier: match.tier,
        matchedTokenCount: SearchIndexHelper.countMatchedTokens(
          contact.searchTokens,
          queryTokens,
        ),
        contactFrequency: contact.contactFrequency,
        isFavorite: contact.isFavorite,
      });
    }

    for (const raw of [...gmailResults, ...office365Results]) {
      const key = raw.email.toLowerCase();
      if (seenEmails.has(key)) continue;
      const match = evaluateContactQueryMatch(raw, query);
      if (!match.passes) continue;
      seenEmails.add(key);
      ranked.push({
        result: this.toProviderSearchResult(raw),
        tier: match.tier,
        matchedTokenCount: 0,
        contactFrequency: 0,
        isFavorite: false,
      });
    }

    return ranked
      .sort(compareContactMatches)
      .slice(0, limit)
      .map((entry) => entry.result);
  }

  /**
   * Blind-index search on the hashed-token column. A contact is a candidate if
   * its stored searchTokens contain ANY query token hash, so a popular query
   * yields hundreds of weak candidates. Ordering by how MANY tokens match keeps
   * the strongest candidates if the pool cap is ever reached.
   */
  private async fetchSearchCandidates(
    userId: string,
    queryTokens: string[],
    limit: number,
  ): Promise<Contact[]> {
    const { tokenParams, orClause, matchScoreExpr } =
      SearchIndexHelper.buildTokenMatchSql(queryTokens);
    const candidateCap = Math.max(
      limit,
      QUERY_LIMITS.CONTACTS_SEARCH_CANDIDATE_POOL,
    );

    const contacts = await this.contactRepository
      .createQueryBuilder("contact")
      .where("contact.userId = :userId", { userId })
      .andWhere(`(${orClause})`, tokenParams)
      .orderBy(matchScoreExpr, "DESC")
      .addOrderBy("contact.contactFrequency", "DESC")
      .addOrderBy("contact.isFavorite", "DESC")
      .take(candidateCap)
      .getMany();

    if (contacts.length >= candidateCap) {
      this.logger.warn(
        `Contact search candidate cap (${candidateCap}) reached for user ${userId}; weaker token matches were not inspected`,
      );
    }
    return contacts;
  }

  /**
   * Gmail / Office 365 contacts have no local DB record; their id is a provider
   * resource name (e.g. "people/c12345") — not a UUID — so mark them
   * isLocal: false and the client suppresses navigation to /crm/contacts/:id.
   */
  private toProviderSearchResult(raw: RawContact): ContactSearchResult {
    return {
      id: raw.providerId,
      email: raw.email,
      name: raw.name,
      firstName: raw.firstName,
      lastName: raw.lastName,
      company: raw.company,
      jobTitle: raw.jobTitle,
      photoUrl: raw.photoUrl,
      isFavorite: false,
      contactFrequency: 0,
      isLocal: false,
    };
  }

  /**
   * Get frequently contacted contacts
   */
  async getFrequentContacts(
    userId: string,
    limit: number = 10,
  ): Promise<ContactSearchResult[]> {
    const contacts = await this.contactRepository.find({
      where: { userId },
      order: {
        isFavorite: "DESC",
        contactFrequency: "DESC",
        lastContactedAt: "DESC",
      },
      take: limit,
    });

    return contacts.map((contact) => this.toSearchResult(contact));
  }

  /**
   * Increment contact frequency when user sends email to this contact
   */
  async incrementContactFrequency(
    userId: string,
    email: string,
  ): Promise<void> {
    const emailHash = SearchIndexHelper.hashExact(email);

    // Use raw SQL for atomic increment to avoid TypeORM column name transformation issues
    await this.contactRepository.query(
      `UPDATE "contacts" 
       SET "contactFrequency" = "contactFrequency" + 1, 
           "lastContactedAt" = $1, 
           "updatedAt" = CURRENT_TIMESTAMP 
       WHERE "userId" = $2 AND "emailHash" = $3`,
      [new Date(), userId, emailHash],
    );

    // If contact doesn't exist, create it
    const existing = await this.contactRepository.findOne({
      where: { userId, emailHash },
    });

    if (!existing) {
      const searchTokens = SearchIndexHelper.generateSearchTokens(
        SearchIndexHelper.extractEmailLocalPart(email),
        SearchIndexHelper.extractEmailDomain(email),
      );

      await this.contactRepository.save({
        userId,
        provider: "manual",
        providerId: `manual-${Date.now()}`,
        email,
        emailHash,
        searchTokens: JSON.stringify(searchTokens),
        contactFrequency: 1,
        lastContactedAt: new Date(),
      });
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId: string, contactId: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });

    if (!contact) {
      throw new Error(ERROR_MESSAGES.CONTACT_NOT_FOUND);
    }

    contact.isFavorite = !contact.isFavorite;
    return this.contactRepository.save(contact);
  }

  /**
   * Get contact by email
   */
  async getContactByEmail(
    userId: string,
    email: string,
  ): Promise<Contact | null> {
    const emailHash = SearchIndexHelper.hashExact(email);
    return this.contactRepository.findOne({
      where: { userId, emailHash },
    });
  }

  /**
   * Get all contacts for a user
   */
  async getAllContacts(userId: string): Promise<ContactSearchResult[]> {
    const contacts = await this.contactRepository.find({
      where: { userId },
      order: {
        name: "ASC",
        email: "ASC",
      },
    });

    return contacts.map((contact) => this.toSearchResult(contact));
  }

  /**
   * Delete a contact
   */
  async deleteContact(userId: string, contactId: string): Promise<void> {
    await this.contactRepository.delete({ id: contactId, userId });
  }

  /**
   * Create or update a manual contact
   */
  async createContact(
    userId: string,
    contactData: {
      email: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      jobTitle?: string;
      phone?: string;
      contactType?: string;
      followUpDate?: string;
    },
  ): Promise<Contact> {
    const emailHash = SearchIndexHelper.hashExact(contactData.email);
    const contactType =
      contactData.contactType === undefined
        ? undefined
        : await this.resolveContactType(userId, contactData.contactType);

    const existing = await this.contactRepository.findOne({
      where: { userId, emailHash },
    });

    const searchTokens = SearchIndexHelper.generateSearchTokens(
      contactData.name,
      contactData.firstName,
      contactData.lastName,
      contactData.company,
      SearchIndexHelper.extractEmailLocalPart(contactData.email),
      SearchIndexHelper.extractEmailDomain(contactData.email),
    );

    if (existing) {
      await this.contactRepository.update(existing.id, {
        email: contactData.email,
        name: contactData.name,
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        company: contactData.company,
        jobTitle: contactData.jobTitle,
        phone: contactData.phone,
        contactType,
        followUpDate: contactData.followUpDate
          ? new Date(contactData.followUpDate)
          : undefined,
        searchTokens: JSON.stringify(searchTokens),
      });
      return this.contactRepository.findOneOrFail({
        where: { id: existing.id },
      });
    }

    return this.contactRepository.save({
      userId,
      provider: "manual",
      providerId: `manual-${Date.now()}`,
      email: contactData.email,
      emailHash,
      name: contactData.name,
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      company: contactData.company,
      jobTitle: contactData.jobTitle,
      phone: contactData.phone,
      contactType: contactType ?? null,
      followUpDate: contactData.followUpDate
        ? new Date(contactData.followUpDate)
        : null,
      searchTokens: JSON.stringify(searchTokens),
    });
  }

  /**
   * A contact's type must be one of the user's own contact types; null or ""
   * clears it. The API used to store any string verbatim, including markup
   * (pentest finding, issue #324).
   */
  private async resolveContactType(
    userId: string,
    contactType: unknown,
  ): Promise<string | null> {
    if (contactType === null || contactType === "") return null;
    const userTypes =
      await this.contactCrmService.ensureDefaultContactTypes(userId);
    if (
      typeof contactType !== "string" ||
      !userTypes.some((type) => type.name === contactType)
    ) {
      throw new BadRequestException("Unknown contact type");
    }
    return contactType;
  }

  // ─── CRM Delegation Methods ──────────────────────────────────────

  async getContactDetail(userId: string, contactId: string) {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const notes = await this.contactCrmService.getContactNotes(contactId);
    const customFields = await this.contactCrmService.getContactCustomFields(
      userId,
      contactId,
    );

    const dealsRaw = await this.contactRepository.manager.query(
      `SELECT d.id, d.title, d.value, ds.name as "stageName"
       FROM deals d
       LEFT JOIN deal_stages ds ON d."stageId" = ds.id
       WHERE d."contactId" = $1 AND d."userId" = $2
       ORDER BY d."createdAt" DESC`,
      [contactId, userId],
    );

    return {
      ...this.toSearchResult(contact),
      notes,
      customFields,
      deals: dealsRaw.map(
        (deal: {
          id: string;
          title: string;
          value: number;
          stageName: string;
        }) => ({
          id: deal.id,
          title: deal.title,
          value: deal.value ? Number(deal.value) : null,
          stageName: deal.stageName || null,
        }),
      ),
    };
  }

  /**
   * Return all email threads that involve a given contact (as sender, direct
   * recipient, or CC recipient).
   *
   * Because `from`, `to`, and `cc` on the Email entity are AES-GCM encrypted
   * with a random IV per write, they cannot be filtered in SQL.  We load the
   * most-recent CONTACT_THREAD_EMAIL_SCAN emails for the user (TypeORM's column
   * transformer decrypts them on load), then filter in application memory.
   *
   * Only the newest email per thread is kept in the result so we surface the
   * most-recent activity for each conversation.
   */
  async getContactThreads(
    userId: string,
    contactId: string,
  ): Promise<ContactThreadSummary[]> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const contactEmail = contact.email.toLowerCase();
    const senderHmac = computeEmailHmac(contactEmail);
    const recipientPattern = buildRecipientHmacPattern(contactEmail);

    // Use HMAC fingerprints for an indexed SQL lookup so we avoid loading and
    // decrypting every email for the user.  Emails ingested before the HMAC
    // columns were added will have NULL fingerprints; the post-filter below
    // catches any that slip through (e.g. during the transition period).
    const emails = await this.emailRepository
      .createQueryBuilder("email")
      .select([
        "email.id",
        "email.emailThreadId",
        "email.threadId",
        "email.from",
        "email.fromName",
        "email.to",
        "email.cc",
        "email.subject",
        "email.receivedAt",
        "email.isRead",
        "email.senderEmailHmac",
        "email.recipientEmailsHmac",
      ])
      .where("email.userId = :userId", { userId })
      .andWhere(
        "(email.senderEmailHmac = :senderHmac OR email.recipientEmailsHmac LIKE :recipientPattern OR email.senderEmailHmac IS NULL)",
        { senderHmac, recipientPattern },
      )
      .orderBy("email.receivedAt", "DESC")
      .take(QUERY_LIMITS.CONTACT_THREAD_EMAIL_SCAN)
      .getMany();

    // Post-filter: verify with decrypted values (handles NULL-HMAC legacy rows
    // and guards against the negligible chance of HMAC collision).
    const seenThreadIds = new Set<string>();
    const threads: ContactThreadSummary[] = [];

    for (const email of emails) {
      if (seenThreadIds.has(email.emailThreadId)) continue;

      const fromDecrypted = (email.from ?? "").toLowerCase();
      const toDecrypted = (email.to ?? "").toLowerCase();
      const ccDecrypted = (email.cc ?? "").toLowerCase();

      const isInFrom = fromDecrypted.includes(contactEmail);
      const isInTo = toDecrypted.includes(contactEmail);
      const isInCc = ccDecrypted.includes(contactEmail);

      if (!isInFrom && !isInTo && !isInCc) continue;

      seenThreadIds.add(email.emailThreadId);
      let role: ContactThreadRole;
      if (isInFrom) {
        role = "from";
      } else if (isInTo) {
        role = "to";
      } else {
        role = "cc";
      }
      threads.push({
        emailThreadId: email.emailThreadId,
        threadId: email.threadId,
        subject: email.subject ?? null,
        from: email.from ?? null,
        fromName: email.fromName ?? null,
        receivedAt: email.receivedAt,
        isRead: email.isRead,
        role,
      });
    }

    return threads;
  }

  async updateContact(
    userId: string,
    contactId: string,
    updates: {
      name?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      jobTitle?: string;
      phone?: string;
      contactType?: string;
      followUpDate?: string | null;
    },
  ): Promise<ContactSearchResult> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const partial: Partial<Contact> = {};
    if (updates.name !== undefined) partial.name = updates.name;
    if (updates.firstName !== undefined) partial.firstName = updates.firstName;
    if (updates.lastName !== undefined) partial.lastName = updates.lastName;
    if (updates.company !== undefined) partial.company = updates.company;
    if (updates.jobTitle !== undefined) partial.jobTitle = updates.jobTitle;
    if (updates.phone !== undefined) partial.phone = updates.phone;
    if (updates.contactType !== undefined) {
      partial.contactType = await this.resolveContactType(
        userId,
        updates.contactType,
      );
      partial.contactTypeAutoDetected = false;
    }
    if (updates.followUpDate !== undefined) {
      partial.followUpDate = updates.followUpDate
        ? new Date(updates.followUpDate)
        : null;
    }

    if (
      updates.name !== undefined ||
      updates.firstName !== undefined ||
      updates.lastName !== undefined ||
      updates.company !== undefined
    ) {
      const searchTokens = SearchIndexHelper.generateSearchTokens(
        updates.name ?? contact.name,
        updates.firstName ?? contact.firstName,
        updates.lastName ?? contact.lastName,
        updates.company ?? contact.company,
        SearchIndexHelper.extractEmailLocalPart(contact.email),
        SearchIndexHelper.extractEmailDomain(contact.email),
      );
      partial.searchTokens = JSON.stringify(searchTokens);
    }

    await this.contactRepository.update(contactId, partial);
    const updated = await this.contactRepository.findOneOrFail({
      where: { id: contactId },
    });
    return this.toSearchResult(updated);
  }

  addContactNote(userId: string, contactId: string, content: string) {
    return this.contactCrmService.addContactNote(userId, contactId, content);
  }

  updateContactNote(
    userId: string,
    contactId: string,
    noteId: string,
    content: string,
  ) {
    return this.contactCrmService.updateContactNote(
      userId,
      contactId,
      noteId,
      content,
    );
  }

  deleteContactNote(userId: string, contactId: string, noteId: string) {
    return this.contactCrmService.deleteContactNote(userId, contactId, noteId);
  }

  getContactTypes(userId: string) {
    return this.contactCrmService.getContactTypes(userId);
  }

  createContactType(
    userId: string,
    input: { name: string; label: string; color?: string; icon?: string },
  ) {
    return this.contactCrmService.createContactType(userId, input);
  }

  updateContactType(
    userId: string,
    typeId: string,
    input: { label?: string; color?: string; icon?: string },
  ) {
    return this.contactCrmService.updateContactType(userId, typeId, input);
  }

  deleteContactType(userId: string, typeId: string) {
    return this.contactCrmService.deleteContactType(userId, typeId);
  }

  getCustomFieldDefinitions(userId: string) {
    return this.contactCrmService.getCustomFieldDefinitions(userId);
  }

  createCustomField(
    userId: string,
    input: { fieldName: string; fieldType?: string; options?: string[] },
  ) {
    return this.contactCrmService.createCustomField(userId, input);
  }

  updateCustomField(
    userId: string,
    fieldId: string,
    input: { fieldName?: string; fieldType?: string; options?: string[] },
  ) {
    return this.contactCrmService.updateCustomField(userId, fieldId, input);
  }

  deleteCustomField(userId: string, fieldId: string) {
    return this.contactCrmService.deleteCustomField(userId, fieldId);
  }

  setCustomFieldValue(
    userId: string,
    contactId: string,
    fieldId: string,
    value: string,
  ) {
    return this.contactCrmService.setCustomFieldValue(
      userId,
      contactId,
      fieldId,
      value,
    );
  }

  async getContactTypesByEmails(
    userId: string,
    emails: string[],
  ): Promise<Record<string, string>> {
    if (emails.length === 0) return {};

    const emailHashes = emails.map((email) =>
      SearchIndexHelper.hashExact(email),
    );
    const contacts = await this.contactRepository.find({
      where: { userId, emailHash: In(emailHashes) },
      select: {
        contactType: true,
        email: true,
      },
    });

    const result: Record<string, string> = {};
    for (const contact of contacts) {
      if (contact.contactType) {
        result[contact.email.toLowerCase()] = contact.contactType;
      }
    }
    return result;
  }

  private toSearchResult(contact: Contact): ContactSearchResult {
    return {
      id: contact.id,
      email: contact.email,
      name: contact.name,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      jobTitle: contact.jobTitle,
      photoUrl: contact.photoUrl,
      isFavorite: contact.isFavorite,
      contactFrequency: contact.contactFrequency,
      contactType: contact.contactType || null,
      followUpDate: contact.followUpDate
        ? contact.followUpDate.toISOString()
        : null,
      phone: contact.phone || null,
      isLocal: true,
    };
  }
}
