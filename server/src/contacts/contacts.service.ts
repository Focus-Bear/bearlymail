import { Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { RawContact } from "./interfaces/contact-provider.interface";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
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

    // Add other providers here (Outlook, etc.)

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

    // Generate query tokens for fuzzy search
    const queryTokens = SearchIndexHelper.generateQueryTokens(query);
    if (queryTokens.length === 0) {
      return [];
    }

    // Blind-index search on the hashed-token column. A contact is a *candidate*
    // if its stored searchTokens contain ANY of the query token hashes — but a
    // single shared trigram (e.g. "kos") is enough to match, so a popular query
    // yields hundreds of weak candidates. We therefore:
    //   1. Rank by how MANY query tokens each contact matches. An exact name
    //      match hits every token and must outrank a one-trigram coincidence;
    //      ordering only by contactFrequency buried zero-frequency exact matches
    //      below high-frequency incidental ones (#2030).
    //   2. Fetch a generous relevance-ranked candidate pool and apply the
    //      visible-field filter BEFORE truncating to `limit`. Truncating first
    //      (the old `.take(limit)`) dropped genuine matches that ranked below
    //      the cut even though they were the only true hits.
    const { tokenParams, orClause, matchScoreExpr } =
      SearchIndexHelper.buildTokenMatchSql(queryTokens);

    const contacts = await this.contactRepository
      .createQueryBuilder("contact")
      .where("contact.userId = :userId", { userId })
      .andWhere(`(${orClause})`, tokenParams)
      .orderBy(matchScoreExpr, "DESC")
      .addOrderBy("contact.contactFrequency", "DESC")
      .addOrderBy("contact.isFavorite", "DESC")
      .take(Math.max(limit, QUERY_LIMITS.CONTACTS_SEARCH_CANDIDATE_POOL))
      .getMany();

    // Also search directly from Gmail for real-time results
    const gmailResults = await this.gmailContactsProvider.searchContacts(
      userId,
      query,
      10,
    );

    // Filter Gmail results to only show contacts where query matches visible fields
    const filteredGmailResults = gmailResults.filter((contact) =>
      this.contactMatchesQuery(contact, query),
    );

    // Merge results, preferring local contacts (they have frequency data)
    const results = new Map<string, ContactSearchResult>();

    // Add local contacts first, but only if they match visible fields
    // (searchTokens can match on tokenized internal data we don't display)
    for (const contact of contacts) {
      if (this.contactMatchesQuery(contact, query)) {
        results.set(contact.email.toLowerCase(), this.toSearchResult(contact));
      }
    }

    // Add Gmail results that aren't already in local.
    // These contacts have no local DB record; their id is a Google People API
    // resource name (e.g. "people/c12345") — not a UUID. Mark them as isLocal: false
    // so the client can suppress navigation to /crm/contacts/:contactId.
    for (const raw of filteredGmailResults) {
      const key = raw.email.toLowerCase();
      if (!results.has(key)) {
        results.set(key, {
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
        });
      }
    }

    return Array.from(results.values()).slice(0, limit);
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
        contactType: contactData.contactType,
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
      contactType: contactData.contactType || null,
      followUpDate: contactData.followUpDate
        ? new Date(contactData.followUpDate)
        : null,
      searchTokens: JSON.stringify(searchTokens),
    });
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
      partial.contactType = updates.contactType;
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

  /**
   * Check if a contact matches the search query in visible fields
   * This filters out false positives from Gmail API that match in hidden fields
   */
  private contactMatchesQuery(
    contact: {
      name?: string;
      firstName?: string;
      lastName?: string;
      email: string;
    },
    query: string,
  ): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const searchableFields = [
      contact.name,
      contact.firstName,
      contact.lastName,
      contact.email,
    ];

    return searchableFields.some((field) => {
      if (!field) return false;
      return field.toLowerCase().includes(normalizedQuery);
    });
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
