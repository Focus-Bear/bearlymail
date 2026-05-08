import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";

import { createUserGoogleOAuthClient } from "../../auth/google-oauth-client";
import { HTTP_STATUS } from "../../constants/http-status";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { isApiError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { logError } from "../../utils/logger";
import {
  ContactProvider,
  RawContact,
} from "../interfaces/contact-provider.interface";

// Forward-ref to avoid circular dep at class-definition time
let googleAccountsServiceGetter: () =>
  | import("../../google-accounts/google-accounts.service").GoogleAccountsService
  | null = null;
export function setGoogleAccountsServiceGetter(
  getter: () =>
    | import("../../google-accounts/google-accounts.service").GoogleAccountsService
    | null,
) {
  googleAccountsServiceGetter = getter;
}

@Injectable()
export class GmailContactsProvider implements ContactProvider {
  readonly providerName = "gmail";
  private readonly logger = new Logger(GmailContactsProvider.name);

  constructor(private usersService: UsersService) {}

  /**
   * Checks if the user is connected to Google for contact sync.
   * Supports two connection models:
   * 1. User.googleCalendarAccessToken — legacy direct OAuth on User entity
   * 2. GoogleAccount entity with active accessToken — linked accounts via /google-accounts
   */
  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    // Legacy: token stored directly on user
    if (user?.googleCalendarAccessToken) {
      return true;
    }
    // Modern: token stored on GoogleAccount entity
    const gas = googleAccountsServiceGetter?.();
    if (gas) {
      try {
        const primary = await gas.findPrimary(userId);
        if (primary?.accessToken) {
          return true;
        }
      } catch {
        // GoogleAccountsService not fully available, fall through
      }
    }
    return false;
  }

  private extractRawContact(
    // people API person schema
    person: Parameters<typeof google.people>[0] extends unknown
      ? {
          resourceName?: string | null;
          names?: Array<{
            displayName?: string | null;
            givenName?: string | null;
            familyName?: string | null;
          }> | null;
          emailAddresses?: Array<{ value?: string | null }> | null;
          phoneNumbers?: Array<{ value?: string | null }> | null;
          organizations?: Array<{
            name?: string | null;
            title?: string | null;
          }> | null;
          photos?: Array<{ url?: string | null }> | null;
        }
      : never,
  ): RawContact | null {
    const email = person.emailAddresses?.[0]?.value;
    if (!email) return null;
    const name = person.names?.[0];
    const org = person.organizations?.[0];
    const photo = person.photos?.[0];
    return {
      providerId: person.resourceName || "",
      email: email.toLowerCase().trim(),
      name: name?.displayName ?? undefined,
      firstName: name?.givenName ?? undefined,
      lastName: name?.familyName ?? undefined,
      phone: person.phoneNumbers?.[0]?.value ?? undefined,
      company: org?.name ?? undefined,
      jobTitle: org?.title ?? undefined,
      photoUrl: photo?.url ?? undefined,
    };
  }

  /**
   * Gets Google OAuth credentials for a user.
   * Checks both legacy (User entity) and modern (GoogleAccount entity) token storage.
   * Returns null if no valid credentials found.
   */
  private async getGoogleOAuthCredentials(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken?: string } | null> {
    const user = await this.usersService.findOne(userId);

    // Try GoogleAccount (modern linked accounts)
    const gas = googleAccountsServiceGetter?.();
    if (gas) {
      try {
        const primary = await gas.findPrimary(userId);
        if (primary?.accessToken) {
          return {
            accessToken: primary.accessToken,
            refreshToken: primary.refreshToken,
          };
        }
      } catch {
        // fall through to legacy
      }
    }

    // Legacy: tokens stored directly on User entity
    if (user?.googleCalendarAccessToken) {
      return {
        accessToken: user.googleCalendarAccessToken,
        refreshToken: user.googleCalendarRefreshToken,
      };
    }

    return null;
  }

  async syncContacts(
    userId: string,
    _fullSync: boolean = false,
  ): Promise<number> {
    const creds = await this.getGoogleOAuthCredentials(userId);
    if (!creds) {
      this.logger.warn(
        `User ${userId} has no Google credentials for contact sync — no googleCalendarAccessToken and no active GoogleAccount`,
      );
      return 0;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    });

    // Token refresh handler — write back to whichever entity holds the token
    oauth2Client.on("tokens", async (tokens) => {
      if (!tokens.access_token) return;
      // Try to update GoogleAccount first (preferred)
      const gas = googleAccountsServiceGetter?.();
      if (gas) {
        try {
          const primary = await gas.findPrimary(userId);
          if (primary) {
            await gas.updateTokens(
              primary.id,
              userId,
              tokens.access_token,
              tokens.refresh_token,
            );
            this.logger.debug(
              `Updated tokens on GoogleAccount ${primary.id} for user ${userId}`,
            );
            return;
          }
        } catch {
          // fall through to legacy update
        }
      }
      // Legacy fallback — update User entity
      await this.usersService.update(userId, {
        googleCalendarAccessToken: tokens.access_token,
        ...(tokens.refresh_token && {
          googleCalendarRefreshToken: tokens.refresh_token,
        }),
      });
    });

    const people = google.people({ version: "v1", auth: oauth2Client });

    try {
      return await this.fetchAndSyncContacts(people, userId);
    } catch (error: unknown) {
      logError(
        `Error syncing contacts for user ${userId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: number | string }).code
          : undefined;
      let errorMessage = "";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        errorMessage = String((error as { message?: unknown }).message);
      }
      this.logger.error(
        `Contact sync failed for user ${userId} — code=${errorCode} message=${errorMessage}`,
      );
      if (
        errorCode === HTTP_STATUS.UNAUTHORIZED ||
        errorCode === HTTP_STATUS.FORBIDDEN ||
        errorMessage.includes("invalid_grant")
      ) {
        // Mark GoogleAccount needsRelogin if applicable
        const gas = googleAccountsServiceGetter?.();
        if (gas) {
          try {
            const primary = await gas.findPrimary(userId);
            if (primary) {
              await gas.markAccountNeedsRelogin(primary.id, userId);
              this.logger.warn(
                `Marked GoogleAccount ${primary.id} as needing relogin`,
              );
            } else {
              await this.usersService.update(userId, { needsRelogin: true });
            }
          } catch {
            // fallback to User entity
            await this.usersService.update(userId, { needsRelogin: true });
          }
        } else {
          await this.usersService.update(userId, { needsRelogin: true });
        }
      }
      throw error;
    }
  }

  private async fetchAndSyncContacts(
    people: ReturnType<typeof google.people>,
    userId: string,
  ): Promise<number> {
    const contacts: RawContact[] = [];
    let nextPageToken: string | undefined;

    do {
      const response = await people.people.connections.list({
        resourceName: "people/me",
        pageSize: QUERY_LIMITS.CONTACTS_API_PAGE_SIZE,
        personFields: "names,emailAddresses,phoneNumbers,organizations,photos",
        pageToken: nextPageToken,
      });

      for (const person of response.data.connections || []) {
        const contact = this.extractRawContact(person);
        if (contact) contacts.push(contact);
      }

      nextPageToken = response.data.nextPageToken || undefined;

      if (contacts.length >= QUERY_LIMITS.MAX_CONTACTS) {
        this.logger.log(`Contact sync limit reached for user ${userId}`);
        break;
      }
    } while (nextPageToken);

    this.logger.log(
      `Fetched ${contacts.length} contacts from Gmail for user ${userId}`,
    );
    return contacts.length;
  }

  async searchContacts(
    userId: string,
    query: string,
    maxResults: number = 20,
  ): Promise<RawContact[]> {
    const creds = await this.getGoogleOAuthCredentials(userId);
    if (!creds) {
      return [];
    }

    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      creds.accessToken,
      creds.refreshToken,
    );

    const people = google.people({ version: "v1", auth: oauth2Client });
    const resultsMap = new Map<string, RawContact>();
    const pageSize = Math.min(maxResults, QUERY_LIMITS.MAX_ISSUES_SEARCH);

    try {
      const response = await people.people.searchContacts({
        query,
        pageSize,
        readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      });

      for (const result of response.data.results || []) {
        const { person } = result;
        if (!person) continue;
        const contact = this.extractRawContact(person);
        if (!contact || resultsMap.has(contact.email)) continue;
        resultsMap.set(contact.email, contact);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error searching main contacts for user ${userId}:`,
        error,
      );
    }

    try {
      const otherResponse = await people.otherContacts.search({
        query,
        pageSize,
        readMask: "names,emailAddresses,phoneNumbers",
      });

      for (const result of otherResponse.data.results || []) {
        const { person } = result;
        if (!person) continue;
        const contact = this.extractRawContact(person);
        if (!contact || resultsMap.has(contact.email)) continue;
        resultsMap.set(contact.email, contact);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Error searching other contacts for user ${userId} (may be expected if scope not granted):`,
        error,
      );
    }

    return Array.from(resultsMap.values()).slice(0, maxResults);
  }

  async getContact(
    userId: string,
    providerId: string,
  ): Promise<RawContact | null> {
    const creds = await this.getGoogleOAuthCredentials(userId);
    if (!creds) {
      return null;
    }

    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      creds.accessToken,
      creds.refreshToken,
    );

    const people = google.people({ version: "v1", auth: oauth2Client });
    try {
      const response = await people.people.get({
        resourceName: providerId,
        personFields: "names,emailAddresses,phoneNumbers,organizations,photos",
      });

      const person = response.data;
      const email = person.emailAddresses?.[0]?.value;
      if (!email) return null;

      const name = person.names?.[0];
      const org = person.organizations?.[0];

      return {
        providerId: person.resourceName || "",
        email: email.toLowerCase().trim(),
        name: name?.displayName,
        firstName: name?.givenName,
        lastName: name?.familyName,
        phone: person.phoneNumbers?.[0]?.value,
        company: org?.name,
        jobTitle: org?.title,
        photoUrl: person.photos?.[0]?.url,
      };
    } catch (error) {
      logError(
        `Error getting contact ${providerId} for user ${userId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Fetch all contacts from Gmail (internal method for sync)
   * Returns raw contacts that ContactsService will process and store
   * Fetches from both "connections" (explicitly added contacts) and
   * "otherContacts" (auto-created from interactions like emails)
   */

  async fetchAllContacts(userId: string): Promise<RawContact[]> {
    const creds = await this.getGoogleOAuthCredentials(userId);
    if (!creds) {
      this.logger.log(
        `User ${userId} has no Google credentials for contact fetch — no googleCalendarAccessToken and no active GoogleAccount`,
      );
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    });

    // Token refresh handler — write back to whichever entity holds the token
    oauth2Client.on("tokens", async (tokens) => {
      if (!tokens.access_token) return;
      const gas = googleAccountsServiceGetter?.();
      if (gas) {
        try {
          const primary = await gas.findPrimary(userId);
          if (primary) {
            await gas.updateTokens(
              primary.id,
              userId,
              tokens.access_token,
              tokens.refresh_token,
            );
            return;
          }
        } catch {
          // fall through
        }
      }
      await this.usersService.update(userId, {
        googleCalendarAccessToken: tokens.access_token,
        ...(tokens.refresh_token && {
          googleCalendarRefreshToken: tokens.refresh_token,
        }),
      });
    });

    const people = google.people({ version: "v1", auth: oauth2Client });
    const contactsMap = new Map<string, RawContact>();

    // Fetch from connections (explicitly added contacts)
    await this.fetchConnectionsContacts(userId, people, contactsMap);

    // Fetch from "Other contacts" (auto-created from interactions)
    await this.fetchOtherContacts(userId, people, contactsMap);

    const contacts = Array.from(contactsMap.values());
    this.logger.log(
      `Fetched ${contacts.length} total contacts for user ${userId}`,
    );

    return contacts;
  }

  /**
   * Fetch contacts from people.connections (explicitly added contacts)
   */
  private async fetchConnectionsContacts(
    userId: string,
    people: ReturnType<typeof google.people>,
    contactsMap: Map<string, RawContact>,
  ): Promise<void> {
    let nextPageToken: string | undefined;

    try {
      do {
        const response = await people.people.connections.list({
          resourceName: "people/me",
          pageSize: QUERY_LIMITS.CONTACTS_API_PAGE_SIZE,
          personFields:
            "names,emailAddresses,phoneNumbers,organizations,photos",
          pageToken: nextPageToken,
        });

        const connections = response.data.connections || [];
        this.logger.log(
          `Fetched ${connections.length} connections for user ${userId}`,
        );

        for (const person of connections) {
          const email = person.emailAddresses?.[0]?.value;
          if (!email) continue;

          const emailKey = email.toLowerCase().trim();
          if (contactsMap.has(emailKey)) continue;

          const name = person.names?.[0];
          const org = person.organizations?.[0];
          const photo = person.photos?.[0];

          contactsMap.set(emailKey, {
            providerId: person.resourceName || "",
            email: emailKey,
            name: name?.displayName,
            firstName: name?.givenName,
            lastName: name?.familyName,
            phone: person.phoneNumbers?.[0]?.value,
            company: org?.name,
            jobTitle: org?.title,
            photoUrl: photo?.url,
          });
        }

        nextPageToken = response.data.nextPageToken || undefined;

        if (contactsMap.size >= QUERY_LIMITS.MAX_CONTACTS) {
          this.logger.log(`Contact limit reached for user ${userId}`);
          return;
        }
      } while (nextPageToken);
    } catch (error: unknown) {
      this.logger.error(
        `Error fetching connections for user ${userId}:`,
        error,
      );
      await this.handleApiError(userId, error);
      throw error;
    }
  }

  /**
   * Fetch contacts from otherContacts (auto-created from interactions like emails)
   * These are contacts that Google automatically creates when you email someone
   */
  private async fetchOtherContacts(
    userId: string,
    people: ReturnType<typeof google.people>,
    contactsMap: Map<string, RawContact>,
  ): Promise<void> {
    let nextPageToken: string | undefined;

    try {
      do {
        const response = await people.otherContacts.list({
          pageSize: QUERY_LIMITS.CONTACTS_API_PAGE_SIZE,
          readMask: "names,emailAddresses,phoneNumbers,photos",
          pageToken: nextPageToken,
        });

        const otherContacts = response.data.otherContacts || [];
        this.logger.log(
          `Fetched ${otherContacts.length} other contacts for user ${userId}`,
        );

        for (const person of otherContacts) {
          const email = person.emailAddresses?.[0]?.value;
          if (!email) continue;

          const emailKey = email.toLowerCase().trim();
          // Skip if we already have this contact from connections
          if (contactsMap.has(emailKey)) continue;

          const name = person.names?.[0];
          const org = person.organizations?.[0];
          const photo = person.photos?.[0];

          contactsMap.set(emailKey, {
            providerId: person.resourceName || "",
            email: emailKey,
            name: name?.displayName,
            firstName: name?.givenName,
            lastName: name?.familyName,
            phone: person.phoneNumbers?.[0]?.value,
            company: org?.name,
            jobTitle: org?.title,
            photoUrl: photo?.url,
          });
        }

        nextPageToken = response.data.nextPageToken || undefined;

        if (contactsMap.size >= QUERY_LIMITS.MAX_CONTACTS) {
          this.logger.log(`Contact limit reached for user ${userId}`);
          return;
        }
      } while (nextPageToken);
    } catch (error: unknown) {
      // Log but don't throw - otherContacts might fail if scope isn't granted
      // but we still want to return the connections we already fetched
      this.logger.warn(
        `Error fetching other contacts for user ${userId} (this may be expected if scope not granted):`,
        error,
      );
    }
  }

  /**
   * Handle API errors and update user status if needed.
   * Marks the GoogleAccount (preferred) or User entity as needing relogin
   * when an auth error is detected.
   */
  private async handleApiError(userId: string, error: unknown): Promise<void> {
    const apiError = isApiError(error) ? error : null;
    const errorCode = apiError?.code;
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error
    ) {
      errorMessage = String((error as { message?: unknown }).message);
    } else {
      errorMessage = "";
    }
    if (
      errorCode === HTTP_STATUS.UNAUTHORIZED ||
      errorMessage.includes("invalid_grant")
    ) {
      const gas = googleAccountsServiceGetter?.();
      if (gas) {
        try {
          const primary = await gas.findPrimary(userId);
          if (primary) {
            await gas.markAccountNeedsRelogin(primary.id, userId);
            return;
          }
        } catch {
          // fall through to User entity fallback
        }
      }
      await this.usersService.update(userId, { needsRelogin: true });
    }
  }
}
