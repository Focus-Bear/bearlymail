import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosInstance } from "axios";

import { QUERY_LIMITS } from "../../constants/query-limits";
import { Office365Client } from "../../emails/providers/office365/office365-client";
import { isAuthError } from "../../emails/providers/office365/office365-operations";
import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { sanitizeAxiosError } from "../../utils/axios-error.utils";
import { logError } from "../../utils/logger";
import {
  ContactProvider,
  RawContact,
} from "../interfaces/contact-provider.interface";

/** Microsoft Graph contact resource (only the fields we map). */
interface GraphContact {
  id?: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  emailAddresses?: Array<{ address?: string | null; name?: string | null }>;
  mobilePhone?: string | null;
  businessPhones?: string[];
  homePhones?: string[];
  companyName?: string | null;
  jobTitle?: string | null;
}

interface GraphContactsPage {
  value?: GraphContact[];
  "@odata.nextLink"?: string;
}

/** Fields requested from Graph — keep in sync with mapGraphContact below. */
const CONTACT_SELECT =
  "id,displayName,givenName,surname,emailAddresses,mobilePhone,businessPhones,homePhones,companyName,jobTitle";

/**
 * Graph caps `$top` on the contacts collection well below our Gmail page size,
 * so use a conservative page size and paginate via `@odata.nextLink`.
 */
const GRAPH_CONTACTS_PAGE_SIZE = 100;

/**
 * Syncs contacts from a connected Office 365 (Outlook) account via Microsoft
 * Graph (`/me/contacts`). Mirrors {@link GmailContactsProvider} so
 * `ContactsService` can treat both providers uniformly.
 */
@Injectable()
export class Office365ContactsProvider implements ContactProvider {
  readonly providerName = "office365";
  private readonly logger = new Logger(Office365ContactsProvider.name);
  private readonly client: Office365Client;

  constructor(
    private readonly office365AccountsService: Office365AccountsService,
    configService: ConfigService,
  ) {
    this.client = new Office365Client(office365AccountsService, configService);
  }

  async isConnected(userId: string): Promise<boolean> {
    return this.office365AccountsService.hasConnectedOffice365(userId);
  }

  private mapGraphContact(contact: GraphContact): RawContact | null {
    const email = contact.emailAddresses?.find(
      (entry) => entry.address,
    )?.address;
    if (!email) return null;
    const phone =
      contact.mobilePhone ||
      contact.businessPhones?.[0] ||
      contact.homePhones?.[0] ||
      undefined;
    return {
      providerId: contact.id || "",
      email: email.toLowerCase().trim(),
      name: contact.displayName ?? undefined,
      firstName: contact.givenName ?? undefined,
      lastName: contact.surname ?? undefined,
      phone,
      company: contact.companyName ?? undefined,
      jobTitle: contact.jobTitle ?? undefined,
    };
  }

  /**
   * Returns an authenticated Graph client for the user's primary Office 365
   * account, refreshing the access token once on an auth error. Returns null
   * when the user has no connected account.
   */
  private async getGraphClient(userId: string): Promise<AxiosInstance | null> {
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Office 365, skipping contact sync.`,
      );
      return null;
    }

    let graphClient = this.client.createGraphClient(primaryAccount.accessToken);
    try {
      await graphClient.get("/me", { params: { $select: "id" } });
      return graphClient;
    } catch (validationError: unknown) {
      if (isAuthError(validationError) && primaryAccount.refreshToken) {
        const accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        graphClient = this.client.createGraphClient(accessToken);
        return graphClient;
      }
      throw validationError;
    }
  }

  async fetchAllContacts(userId: string): Promise<RawContact[]> {
    const graphClient = await this.getGraphClient(userId);
    if (!graphClient) return [];

    const contactsByEmail = new Map<string, RawContact>();
    // Absolute nextLink URLs from Graph are passed straight to axios (which
    // ignores baseURL for absolute URLs); the first request uses a relative path.
    let nextUrl: string | undefined =
      `/me/contacts?$select=${CONTACT_SELECT}&$top=${GRAPH_CONTACTS_PAGE_SIZE}`;

    try {
      while (nextUrl) {
        const response = await graphClient.get<GraphContactsPage>(nextUrl);
        for (const graphContact of response.data.value || []) {
          const contact = this.mapGraphContact(graphContact);
          if (contact && !contactsByEmail.has(contact.email)) {
            contactsByEmail.set(contact.email, contact);
          }
        }
        if (contactsByEmail.size >= QUERY_LIMITS.MAX_CONTACTS) {
          this.logger.log(`Contact limit reached for user ${userId}`);
          break;
        }
        nextUrl = response.data["@odata.nextLink"];
      }
    } catch (error: unknown) {
      logError(
        `Error fetching Office 365 contacts for user ${userId}: ${sanitizeAxiosError(error)}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }

    const contacts = Array.from(contactsByEmail.values());
    this.logger.log(
      `Fetched ${contacts.length} contacts from Office 365 for user ${userId}`,
    );
    return contacts;
  }

  async syncContacts(
    userId: string,
    _fullSync: boolean = false,
  ): Promise<number> {
    const contacts = await this.fetchAllContacts(userId);
    return contacts.length;
  }

  async searchContacts(
    userId: string,
    query: string,
    maxResults: number = 20,
  ): Promise<RawContact[]> {
    try {
      const graphClient = await this.getGraphClient(userId);
      if (!graphClient) return [];
      // `$search` on contacts requires the eventual consistency header.
      const response = await graphClient.get<GraphContactsPage>(
        `/me/contacts?$select=${CONTACT_SELECT}&$top=${maxResults}`,
        {
          params: { $search: `"${query}"` },
          headers: { ConsistencyLevel: "eventual" },
        },
      );
      const results = new Map<string, RawContact>();
      for (const graphContact of response.data.value || []) {
        const contact = this.mapGraphContact(graphContact);
        if (contact && !results.has(contact.email)) {
          results.set(contact.email, contact);
        }
      }
      return Array.from(results.values()).slice(0, maxResults);
    } catch (error: unknown) {
      this.logger.warn(
        `Error searching Office 365 contacts for user ${userId}: ${sanitizeAxiosError(error)}`,
      );
      return [];
    }
  }

  async getContact(
    userId: string,
    providerId: string,
  ): Promise<RawContact | null> {
    try {
      const graphClient = await this.getGraphClient(userId);
      if (!graphClient) return null;
      const response = await graphClient.get<GraphContact>(
        `/me/contacts/${providerId}`,
        { params: { $select: CONTACT_SELECT } },
      );
      return this.mapGraphContact(response.data);
    } catch (error: unknown) {
      logError(
        `Error getting Office 365 contact ${providerId} for user ${userId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }
}
