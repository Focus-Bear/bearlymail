import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";
import { UsersService } from "../../users/users.service";
import {
  ContactProvider,
  RawContact,
} from "../interfaces/contact-provider.interface";
import { isApiError } from "../../types/common";
import { QUERY_LIMITS } from "../../constants/query-limits";

@Injectable()
export class GmailContactsProvider implements ContactProvider {
  readonly providerName = "gmail";
  private readonly logger = new Logger(GmailContactsProvider.name);

  constructor(private usersService: UsersService) {}

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return !!user?.googleCalendarAccessToken;
  }

  // eslint-disable-next-line max-lines-per-function, max-statements
  async syncContacts(
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fullSync: boolean = false,
  ): Promise<number> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log(
        `User ${userId} not connected to Google, skipping contact sync.`,
      );
      return 0;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const people = google.people({ version: "v1", auth: oauth2Client });

    try {
      const contacts: RawContact[] = [];
      let nextPageToken: string | undefined;
      let totalSynced = 0;

      do {
        const response = await people.people.connections.list({
          resourceName: "people/me",
          pageSize: 1000,
          personFields:
            "names,emailAddresses,phoneNumbers,organizations,photos",
          pageToken: nextPageToken,
        });

        const connections = response.data.connections || [];

        for (const person of connections) {
          const email = person.emailAddresses?.[0]?.value;
          // Skip contacts without email
          if (!email) continue;

          const name = person.names?.[0];
          const org = person.organizations?.[0];
          const photo = person.photos?.[0];

          contacts.push({
            providerId: person.resourceName || "",
            email: email.toLowerCase().trim(),
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
        totalSynced = contacts.length;

        // Limit to prevent excessive API calls
        if (contacts.length >= 5000) {
          this.logger.log(`Contact sync limit reached for user ${userId}`);
          break;
        }
      } while (nextPageToken);

      this.logger.log(
        `Fetched ${contacts.length} contacts from Gmail for user ${userId}`,
      );

      // Return raw contacts - the service will handle storing them
      // The ContactsService will call this and then store them
      return totalSynced;
    } catch (error: unknown) {
      console.error(`Error syncing contacts for user ${userId}:`, error);

      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: number | string }).code
          : undefined;
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
        errorCode === 401 ||
        errorCode === 403 ||
        errorMessage.includes("invalid_grant")
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }

      throw error;
    }
  }

  async searchContacts(
    userId: string,
    query: string,
    maxResults: number = 20,
  ): Promise<RawContact[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const people = google.people({ version: "v1", auth: oauth2Client });

    try {
      // Use searchContacts for real-time search
      const response = await people.people.searchContacts({
        query,
        pageSize: Math.min(maxResults, QUERY_LIMITS.MAX_ISSUES_SEARCH),
        readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      });

      const results: RawContact[] = [];

      for (const result of response.data.results || []) {
        const { person } = result;
        if (!person) continue;

        const email = person.emailAddresses?.[0]?.value;
        if (!email) continue;

        const name = person.names?.[0];
        const org = person.organizations?.[0];
        const photo = person.photos?.[0];

        results.push({
          providerId: person.resourceName || "",
          email: email.toLowerCase().trim(),
          name: name?.displayName,
          firstName: name?.givenName,
          lastName: name?.familyName,
          phone: person.phoneNumbers?.[0]?.value,
          company: org?.name,
          jobTitle: org?.title,
          photoUrl: photo?.url,
        });
      }

      return results;
    } catch (error: unknown) {
      console.error(`Error searching contacts for user ${userId}:`, error);
      return [];
    }
  }

  async getContact(
    userId: string,
    providerId: string,
  ): Promise<RawContact | null> {
    const user = await this.usersService.findOne(userId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    if (!user?.googleCalendarAccessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const people = google.people({ version: "v1", auth: oauth2Client });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const photo = person.photos?.[0];

      return {
        providerId: person.resourceName || "",
        email: email.toLowerCase().trim(),
        name: name?.displayName,
        firstName: name?.givenName,
        lastName: name?.familyName,
        phone: person.phoneNumbers?.[0]?.value,
        company: org?.name,
        jobTitle: org?.title,
        photoUrl: photo?.url,
      };
    } catch (error) {
      console.error(
        `Error getting contact ${providerId} for user ${userId}:`,
        error,
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
  // eslint-disable-next-line max-statements, max-lines-per-function
  async fetchAllContacts(userId: string): Promise<RawContact[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log(
        `User ${userId} has no Google access token, skipping contact fetch`,
      );
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
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
          pageSize: 1000,
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

        if (contactsMap.size >= 5000) {
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
          pageSize: 1000,
          readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
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

        if (contactsMap.size >= 5000) {
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
   * Handle API errors and update user status if needed
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
    if (errorCode === 401 || errorMessage.includes("invalid_grant")) {
      await this.usersService.update(userId, { needsRelogin: true });
    }
  }
}
