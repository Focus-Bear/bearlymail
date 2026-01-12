import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";
import { UsersService } from "../users/users.service";
import { EmailsService } from "./emails.service";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Email } from "../database/entities/email.entity";
import { RawEmailMessage } from "./interfaces/email-provider.interface";

interface GmailPayloadPart {
  // eslint-disable-next-line id-denylist
  body?: { data?: string };
  mimeType?: string;
  parts?: GmailPayloadPart[];
}

interface GmailPayload {
  // eslint-disable-next-line id-denylist
  body?: { data?: string };
  mimeType?: string;
  parts?: GmailPayloadPart[];
  snippet?: string;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private usersService: UsersService,
    private emailsService: EmailsService,
  ) {}

  // Helper function to extract full body from Gmail message payload
  private extractBodyFromPayload(payload: GmailPayload): {
    body: string;
    htmlBody?: string;
  } {
    let body = "";
    let htmlBody = "";

    const extractPart = (part: GmailPayloadPart) => {
      if (part.body?.data) {
        const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
        if (part.mimeType === "text/plain") {
          body = decoded;
        } else if (part.mimeType === "text/html") {
          htmlBody = decoded;
        }
      }

      if (part.parts) {
        part.parts.forEach(extractPart);
      }
    };

    extractPart(payload);

    return {
      body: body || payload.snippet || "",
      htmlBody: htmlBody || undefined,
    };
  }

  // eslint-disable-next-line max-statements
  async scanHistory(userId: string): Promise<void> {
    this.logger.log(`Starting historical email scan for user ${userId}`);
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) return;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Fetch last 100 emails (Inbox and Sent)
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 100,
        // Limit for initial scan
        q: "label:INBOX OR label:SENT",
      });

      const messages = response.data.messages || [];
      const total = messages.length;
      this.logger.log(`Found ${total} historical messages to analyze.`);

      // Initialize progress
      await this.usersService.update(userId, {
        scanProgress: 0,
        scanTotal: total,
      });

      // Process in chunks to avoid rate limits
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg.id) continue;

        // Check if already exists
        const existing = await this.emailsService.getEmailByMessageId(
          userId,
          msg.id,
        );
        if (existing) {
          // Still update progress even if skipped
          await this.usersService.update(userId, { scanProgress: i + 1 });
          continue;
        }

        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        // Simplified saving logic (reuse sync logic or call createEmail)
        const headers = fullMsg.data.payload?.headers || [];
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const labelIds = fullMsg.data.labelIds || [];
        const starCount = labelIds.includes("STARRED") ? 3 : 0;
        // Gmail starred = 3 stars

        // Parse "From"
        const fromMatch = from.match(/(.*)<(.+)>/);
        const fromName = fromMatch ? fromMatch[1].trim() : undefined;
        const fromEmail = fromMatch ? fromMatch[2].trim() : from;

        // Extract full body (text and HTML)
        const { body, htmlBody } = this.extractBodyFromPayload(
          fullMsg.data.payload,
        );

        // Save to DB (this will also trigger priority calculation)
        await this.emailsService.createEmail(userId, {
          messageId: msg.id!,
          threadId: msg.threadId!,
          subject,
          from: fromEmail,
          fromName,
          body,
          htmlBody,
          starCount,
          receivedAt: new Date(
            parseInt(fullMsg.data.internalDate || Date.now().toString()),
          ),
          isRead: !labelIds.includes("UNREAD"),
          // Mark history as read if it is
        } as RawEmailMessage);

        // Update progress
        await this.usersService.update(userId, { scanProgress: i + 1 });
      }

      // Mark scan as complete
      await this.usersService.update(userId, {
        scanProgress: total,
        hasScannedHistory: true,
      });

      this.logger.log(`Historical scan completed for user ${userId}`);
    } catch (error) {
      this.logger.error("Error scanning history:", error);
      // Reset progress on error
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }
  }

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async syncEmails(userId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log("User not connected to Google");
      return;
    }

    // Create a new OAuth2 client for this request to ensure thread safety
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh events
    oauth2Client.on("tokens", async (tokens) => {
      this.logger.log("Tokens refreshed for user", userId);
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get list of messages
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 20,
        // Fetch both starred (Process) and Inbox (Triage), excluding snoozed/VA
        q: "(is:starred OR label:INBOX) -label:SnoozedFocusBear -label:VA-to-action",
      });

      const messages = response.data.messages || [];

      for (const msg of messages) {
        if (!msg.id) continue;

        // Fetch full message details
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = fullMsg.data.payload?.headers || [];
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const labelIds = fullMsg.data.labelIds || [];
        const starCount = labelIds.includes("STARRED") ? 3 : 0;
        // Gmail starred = 3 stars

        // Parse "From" header (e.g., "Name <email@example.com>")
        const fromMatch = from.match(/(.*)<(.+)>/);
        const fromName = fromMatch ? fromMatch[1].trim() : undefined;
        const fromEmail = fromMatch ? fromMatch[2].trim() : from;

        // Extract full body (text and HTML)
        const { body, htmlBody } = this.extractBodyFromPayload(
          fullMsg.data.payload,
        );

        // Check if email already exists using the string messageId
        const existing = await this.emailsService.getEmailByMessageId(
          userId,
          msg.id,
        );
        if (existing) {
          // Update thread-level metadata (starred status and archived status) for existing emails
          // This ensures status changes in Gmail are reflected in our app
          const isArchivedInGmail = !labelIds.includes("INBOX");

          // Update EmailThread instead of individual Email
          if (existing.threadId) {
            await this.emailsService.updateThreadStarCount(
              userId,
              existing.threadId,
              starCount,
            );
            await this.emailsService.updateThreadArchivedStatus(
              userId,
              existing.threadId,
              isArchivedInGmail,
            );
          }

          // Update body if missing or empty
          if ((!existing.body || existing.body.trim() === "") && body) {
            await this.emailsService.updateEmail(existing.id, {
              body,
              htmlBody,
            });
          }
          continue;
        }

        // Save to DB
        await this.emailsService.createEmail(userId, {
          messageId: msg.id!,
          threadId: msg.threadId!,
          subject,
          from: fromEmail,
          fromName,
          body,
          htmlBody,
          starCount,
          receivedAt: new Date(
            parseInt(fullMsg.data.internalDate || Date.now().toString()),
          ),
        } as RawEmailMessage);
      }
    } catch (error) {
      this.logger.error("Error syncing emails:", error);
      // Check for 401 Unauthorized or invalid_grant
      const errorObj = error as {
        code?: number;
        response?: { status?: number };
        message?: string;
      };
      if (
        errorObj.code === 401 ||
        (errorObj.response && errorObj.response.status === 401) ||
        (errorObj.message && errorObj.message.includes("invalid_grant"))
      ) {
        this.logger.log(
          `Auth error for user ${userId}, flagging for re-login.`,
        );
        await this.usersService.update(userId, { needsRelogin: true });
      }
    }
  }

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Google");
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

    // Handle token refresh events
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

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Create email message
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];

    const email = emailLines.join("\r\n").trim();

    // Encode message in base64url format
    const encodedMessage = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
          threadId,
        },
      });
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error("Error sending reply:", error);
      const apiError = error as {
        code?: number;
        response?: { status?: number };
        message?: string;
      };
      if (
        apiError.code === 401 ||
        (apiError.response && apiError.response.status === 401) ||
        (apiError.message && apiError.message.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }
}
