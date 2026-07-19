import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";

import { createUserGoogleOAuthClient } from "../auth/google-oauth-client";
import { HTTP_STATUS } from "../constants/http-status";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import {
  decodeRfc2047HeaderValue,
  encodeRfc2047Unstructured,
} from "../utils/rfc2047-header.util";
import { EmailsService } from "./emails.service";
import { RawEmailMessage } from "./interfaces/email-provider.interface";
import { GmailPayload, GmailPayloadPart } from "./types/gmail.types";

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

  private async processScanMessage(
    userId: string,
    gmail: ReturnType<typeof google.gmail>,
    msg: { id?: string | null; threadId?: string | null },
    index: number,
  ): Promise<boolean> {
    if (!msg.id) return false;
    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      msg.id,
    );
    if (existing) {
      await this.usersService.update(userId, { scanProgress: index + 1 });
      return false;
    }
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const headers = fullMsg.data.payload?.headers || [];
    const subject = decodeRfc2047HeaderValue(
      headers.find((header) => header.name === "Subject")?.value ||
        "(No Subject)",
    );
    const from = headers.find((header) => header.name === "From")?.value || "";
    const labelIds = fullMsg.data.labelIds || [];
    const starCount = labelIds.includes("STARRED") ? 3 : 0;
    const fromMatch = from.match(/(.*)<(.+)>/);
    const fromName = fromMatch ? fromMatch[1].trim() : undefined;
    const fromEmail = fromMatch ? fromMatch[2].trim() : from;
    const { body, htmlBody } = this.extractBodyFromPayload(
      fullMsg.data.payload,
    );
    await this.emailsService.createEmail(userId, {
      messageId: msg.id,
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
    } as RawEmailMessage);
    await this.usersService.update(userId, { scanProgress: index + 1 });
    return true;
  }

  async scanHistory(userId: string): Promise<void> {
    this.logger.log(`Starting historical email scan for user ${userId}`);
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) return;
    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      user.googleCalendarAccessToken,
      user.googleCalendarRefreshToken,
    );
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    try {
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 100,
        q: "label:INBOX OR label:SENT",
      });
      const messages = response.data.messages || [];
      const total = messages.length;
      this.logger.log(`Found ${total} historical messages to analyze.`);
      await this.usersService.update(userId, {
        scanProgress: 0,
        scanTotal: total,
      });
      for (let i = 0; i < messages.length; i++) {
        await this.processScanMessage(userId, gmail, messages[i], i);
      }
      await this.usersService.update(userId, {
        scanProgress: total,
        hasScannedHistory: true,
      });
      this.logger.log(`Historical scan completed for user ${userId}`);
    } catch (error) {
      this.logger.error("Error scanning history:", error);
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }
  }

  private async handleExistingGmailEmail(options: {
    userId: string;
    existing: { id: string; threadId: string; body?: string };
    labelIds: string[];
    starCount: number;
    body: string;
    htmlBody: string | undefined;
  }): Promise<void> {
    const { userId, existing, labelIds, starCount, body, htmlBody } = options;
    const isArchivedInGmail = !labelIds.includes("INBOX");
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
    if ((!existing.body || existing.body.trim() === "") && body) {
      await this.emailsService.updateEmail(userId, existing.id, {
        body,
        htmlBody,
      });
    }
  }

  private async processGmailMessage(
    userId: string,
    gmail: ReturnType<typeof google.gmail>,
    msg: { id?: string | null; threadId?: string | null },
  ): Promise<void> {
    if (!msg.id) return;
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const headers = fullMsg.data.payload?.headers || [];
    const subject = decodeRfc2047HeaderValue(
      headers.find((header) => header.name === "Subject")?.value ||
        "(No Subject)",
    );
    const from = headers.find((header) => header.name === "From")?.value || "";
    const labelIds = fullMsg.data.labelIds || [];
    const starCount = labelIds.includes("STARRED") ? 3 : 0;
    const fromMatch = from.match(/(.*)<(.+)>/);
    const fromName = fromMatch ? fromMatch[1].trim() : undefined;
    const fromEmail = fromMatch ? fromMatch[2].trim() : from;
    const { body, htmlBody } = this.extractBodyFromPayload(
      fullMsg.data.payload,
    );
    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      msg.id,
    );
    if (existing) {
      await this.handleExistingGmailEmail({
        userId,
        existing,
        labelIds,
        starCount,
        body,
        htmlBody,
      });
      return;
    }
    await this.emailsService.createEmail(userId, {
      messageId: msg.id,
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
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 20,
        q: "(is:starred OR label:INBOX) -label:SnoozedBearlyMail -label:VA-to-action",
      });
      const messages = response.data.messages || [];
      for (const msg of messages) {
        await this.processGmailMessage(userId, gmail, msg);
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
        errorObj.code === HTTP_STATUS.UNAUTHORIZED ||
        (errorObj.response &&
          errorObj.response.status === HTTP_STATUS.UNAUTHORIZED) ||
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
      `Subject: ${encodeRfc2047Unstructured(subject)}`,
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
      logError(
        "Error sending reply",
        error instanceof Error ? error : new Error(String(error)),
      );
      const apiError = error as {
        code?: number;
        response?: { status?: number };
        message?: string;
      };
      if (
        apiError.code === HTTP_STATUS.UNAUTHORIZED ||
        (apiError.response &&
          apiError.response.status === HTTP_STATUS.UNAUTHORIZED) ||
        (apiError.message && apiError.message.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }
}
