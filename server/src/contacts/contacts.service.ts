import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contact } from '../database/entities/contact.entity';
import { RawContact } from './interfaces/contact-provider.interface';
import { SearchIndexHelper } from './search-index.helper';
import { GmailContactsProvider } from './providers/gmail-contacts.provider';

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
}

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    private gmailContactsProvider: GmailContactsProvider,
  ) {}

  /**
   * Sync contacts from all connected providers
   */
  async syncContacts(userId: string, fullSync: boolean = false): Promise<{ synced: number; provider: string }[]> {
    const results: { synced: number; provider: string }[] = [];

    // Sync from Gmail if connected
    if (await this.gmailContactsProvider.isConnected(userId)) {
      try {
        const rawContacts = await this.gmailContactsProvider.fetchAllContacts(userId);
        const synced = await this.upsertContacts(userId, 'gmail', rawContacts);
        results.push({ synced, provider: 'gmail' });
      } catch (error) {
        console.error('Gmail contact sync failed:', error);
        results.push({ synced: 0, provider: 'gmail' });
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
        } else {
          // Create new contact
          await this.contactRepository.save({
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
        }

        upserted++;
      } catch (error) {
        console.error(`Error upserting contact ${raw.email}:`, error);
      }
    }

    console.log(`Upserted ${upserted} contacts for user ${userId} from ${provider}`);
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
    
    // Search using LIKE on searchTokens (stored as JSON array of hashes)
    // This is a simplified approach - for production, consider using
    // a dedicated search index (Elasticsearch, PostgreSQL full-text search)
    const contacts = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.userId = :userId', { userId })
      .andWhere(
        queryTokens.map((_, i) => `contact.searchTokens LIKE :token${i}`).join(' OR '),
        queryTokens.reduce((acc, token, i) => {
          acc[`token${i}`] = `%${token}%`;
          return acc;
        }, {} as Record<string, string>),
      )
      .orderBy('contact.contactFrequency', 'DESC')
      .addOrderBy('contact.isFavorite', 'DESC')
      .take(limit)
      .getMany();

    // Also search directly from Gmail for real-time results
    const gmailResults = await this.gmailContactsProvider.searchContacts(userId, query, 10);
    
    // Merge results, preferring local contacts (they have frequency data)
    const results = new Map<string, ContactSearchResult>();
    
    // Add local contacts first
    for (const contact of contacts) {
      results.set(contact.email.toLowerCase(), this.toSearchResult(contact));
    }
    
    // Add Gmail results that aren't already in local
    for (const raw of gmailResults) {
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
        });
      }
    }

    return Array.from(results.values()).slice(0, limit);
  }

  /**
   * Get frequently contacted contacts
   */
  async getFrequentContacts(userId: string, limit: number = 10): Promise<ContactSearchResult[]> {
    const contacts = await this.contactRepository.find({
      where: { userId },
      order: {
        isFavorite: 'DESC',
        contactFrequency: 'DESC',
        lastContactedAt: 'DESC',
      },
      take: limit,
    });

    return contacts.map(c => this.toSearchResult(c));
  }

  /**
   * Increment contact frequency when user sends email to this contact
   */
  async incrementContactFrequency(userId: string, email: string): Promise<void> {
    const emailHash = SearchIndexHelper.hashExact(email);
    
    await this.contactRepository
      .createQueryBuilder()
      .update(Contact)
      .set({
        contactFrequency: () => 'contact_frequency + 1',
        lastContactedAt: new Date(),
      })
      .where('userId = :userId AND emailHash = :emailHash', { userId, emailHash })
      .execute();

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
        provider: 'manual',
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
      throw new Error('Contact not found');
    }

    contact.isFavorite = !contact.isFavorite;
    return this.contactRepository.save(contact);
  }

  /**
   * Get contact by email
   */
  async getContactByEmail(userId: string, email: string): Promise<Contact | null> {
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
        name: 'ASC',
        email: 'ASC',
      },
    });

    return contacts.map(c => this.toSearchResult(c));
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
    data: { email: string; name?: string; firstName?: string; lastName?: string; company?: string; jobTitle?: string },
  ): Promise<Contact> {
    const emailHash = SearchIndexHelper.hashExact(data.email);
    
    // Check if contact already exists
    const existing = await this.contactRepository.findOne({
      where: { userId, emailHash },
    });

    const searchTokens = SearchIndexHelper.generateSearchTokens(
      data.name,
      data.firstName,
      data.lastName,
      data.company,
      SearchIndexHelper.extractEmailLocalPart(data.email),
      SearchIndexHelper.extractEmailDomain(data.email),
    );

    if (existing) {
      // Update existing
      await this.contactRepository.update(existing.id, {
        email: data.email,
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        jobTitle: data.jobTitle,
        searchTokens: JSON.stringify(searchTokens),
      });
      return this.contactRepository.findOneOrFail({ where: { id: existing.id } });
    }

    // Create new
    return this.contactRepository.save({
      userId,
      provider: 'manual',
      providerId: `manual-${Date.now()}`,
      email: data.email,
      emailHash,
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      jobTitle: data.jobTitle,
      searchTokens: JSON.stringify(searchTokens),
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
    };
  }
}




