import { Injectable } from "@nestjs/common";
import { google } from "googleapis";
import { UsersService } from "../../users/users.service";
import {
  ContactProvider,
  RawContact,
} from "../interfaces/contact-provider.interface";

@Injectable()
export class GmailContactsProvider implements ContactProvider {
  readonly providerName = "gmail";

  constructor(private usersService: UsersService) {}

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return !!user?.googleCalendarAccessToken;
  }

  async syncContacts(
    userId: string,
    fullSync: boolean = false,
  ): Promise<number> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(
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
          if (!email) continue; // Skip contacts without email

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
          console.log(`Contact sync limit reached for user ${userId}`);
          break;
        }
      } while (nextPageToken);

      console.log(
        `Fetched ${contacts.length} contacts from Gmail for user ${userId}`,
      );

      // Return raw contacts - the service will handle storing them
      // The ContactsService will call this and then store them
      return totalSynced;
    } catch (error: any) {
      console.error(`Error syncing contacts for user ${userId}:`, error);

      if (
        error.code === 401 ||
        error.code === 403 ||
        error.message?.includes("invalid_grant")
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
        pageSize: Math.min(maxResults, 30),
        readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      });

      const results: RawContact[] = [];

      for (const result of response.data.results || []) {
        const person = result.person;
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
    } catch (error: any) {
      console.error(`Error searching contacts for user ${userId}:`, error);
      return [];
    }
  }

  async getContact(
    userId: string,
    providerId: string,
  ): Promise<RawContact | null> {
    const user = await this.usersService.findOne(userId);
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
   */
  async fetchAllContacts(userId: string): Promise<RawContact[]> {
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
    const contacts: RawContact[] = [];
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

        for (const person of response.data.connections || []) {
          const email = person.emailAddresses?.[0]?.value;
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

        if (contacts.length >= 5000) break;
      } while (nextPageToken);

      return contacts;
    } catch (error: any) {
      console.error(`Error fetching contacts for user ${userId}:`, error);
      if (error.code === 401 || error.message?.includes("invalid_grant")) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }
}
