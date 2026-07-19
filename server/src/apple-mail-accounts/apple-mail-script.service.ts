import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { BYTE_CONVERSIONS } from "../constants/service-constants";
import { MILLISECONDS, SECONDS } from "../constants/time-constants";
import {
  FETCH_INBOX_SUMMARY_SCRIPT,
  FETCH_MESSAGE_DETAILS_SCRIPT,
  LIST_ACCOUNTS_SCRIPT,
  LIST_INBOX_APPLE_IDS_SCRIPT,
  MOVE_MESSAGES_SCRIPT,
  SAVE_ATTACHMENT_SCRIPT,
  SEND_MESSAGE_SCRIPT,
  SET_FLAGGED_SCRIPT,
  SET_READ_SCRIPT,
} from "./apple-mail-scripts";

export interface AppleMailAccountInfo {
  name: string;
  enabled: boolean;
  emails: string[];
  fullName: string;
}

export interface AppleMailMessageSummary {
  appleId: number;
  subject: string;
  sender: string;
  dateReceivedMs: number;
  isRead: boolean;
  isFlagged: boolean;
  accountName: string;
}

export interface AppleMailAttachmentInfo {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  downloaded: boolean;
}

export interface AppleMailMessageDetail {
  appleId: number;
  messageId: string;
  content: string;
  allHeaders: string;
  attachments: AppleMailAttachmentInfo[];
}

/** Addresses one concrete message inside Mail.app. */
export interface AppleMailMessageItem {
  accountName: string;
  appleId: number;
}

export interface AppleMailSendParams {
  senderEmail?: string;
  senderName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentPaths?: string[];
  replyTo?: AppleMailMessageItem;
}

const DEFAULT_TIMEOUT_MS = SECONDS.TWO_MINUTES * MILLISECONDS.SECOND;
const FETCH_TIMEOUT_MS = 2 * SECONDS.FIVE_MINUTES * MILLISECONDS.SECOND;
/** Message bodies for a whole sync window can be several MB of JSON. */
const MAX_STDOUT_BYTES = 100 * BYTE_CONVERSIONS.MB;
const MACOS_PLATFORM = "darwin";
const ERROR_SNIPPET_LENGTH = 2 * 100;

/**
 * Executes JXA scripts against the local Mail.app via `osascript`.
 * Only functional when the server runs on macOS on the same machine as the
 * user's Mail database; first use triggers a one-time macOS automation
 * permission prompt for the process that owns the server.
 */
@Injectable()
export class AppleMailScriptService {
  private readonly logger = new Logger(AppleMailScriptService.name);

  isSupported(): boolean {
    return process.platform === MACOS_PLATFORM;
  }

  async listAccounts(): Promise<AppleMailAccountInfo[]> {
    return this.runScript<AppleMailAccountInfo[]>(LIST_ACCOUNTS_SCRIPT);
  }

  async fetchInboxSummaries(params: {
    accountNames: string[];
    sinceMs: number;
    maxMessages: number;
  }): Promise<AppleMailMessageSummary[]> {
    return this.runScript<AppleMailMessageSummary[]>(
      FETCH_INBOX_SUMMARY_SCRIPT,
      params,
      FETCH_TIMEOUT_MS,
    );
  }

  async listInboxAppleIds(params: {
    accountNames: string[];
  }): Promise<{ appleIds: number[] }> {
    return this.runScript<{ appleIds: number[] }>(
      LIST_INBOX_APPLE_IDS_SCRIPT,
      params,
      FETCH_TIMEOUT_MS,
    );
  }

  async fetchMessageDetails(
    items: AppleMailMessageItem[],
  ): Promise<AppleMailMessageDetail[]> {
    if (items.length === 0) return [];
    return this.runScript<AppleMailMessageDetail[]>(
      FETCH_MESSAGE_DETAILS_SCRIPT,
      { items },
      FETCH_TIMEOUT_MS,
    );
  }

  async setFlagged(params: {
    items: AppleMailMessageItem[];
    flagged: boolean;
  }): Promise<{ updated: number }> {
    if (params.items.length === 0) return { updated: 0 };
    return this.runScript<{ updated: number }>(SET_FLAGGED_SCRIPT, params);
  }

  async setRead(params: {
    items: AppleMailMessageItem[];
    read: boolean;
  }): Promise<{ updated: number }> {
    if (params.items.length === 0) return { updated: 0 };
    return this.runScript<{ updated: number }>(SET_READ_SCRIPT, params);
  }

  async moveMessages(params: {
    items: AppleMailMessageItem[];
    target: "archive" | "inbox" | "trash";
  }): Promise<{ moved: number; errors: string[] }> {
    if (params.items.length === 0) return { moved: 0, errors: [] };
    const result = await this.runScript<{ moved: number; errors: string[] }>(
      MOVE_MESSAGES_SCRIPT,
      params,
    );
    for (const error of result.errors) {
      this.logger.warn(`moveMessages(${params.target}): ${error}`);
    }
    return result;
  }

  async saveAttachment(params: {
    accountName: string;
    appleId: number;
    attachmentId?: string;
    attachmentName?: string;
    targetPath: string;
  }): Promise<{ saved: boolean; error?: string }> {
    return this.runScript<{ saved: boolean; error?: string }>(
      SAVE_ATTACHMENT_SCRIPT,
      params,
    );
  }

  async sendMessage(
    params: AppleMailSendParams,
  ): Promise<{ sent: boolean; messageId: string | null; error?: string }> {
    return this.runScript<{
      sent: boolean;
      messageId: string | null;
      error?: string;
    }>(SEND_MESSAGE_SCRIPT, params, FETCH_TIMEOUT_MS);
  }

  private async runScript<T>(
    script: string,
    params?: object,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    if (!this.isSupported()) {
      throw new Error(
        "Apple Mail integration requires the server to run on macOS",
      );
    }

    const args = ["-l", "JavaScript", "-e", script];
    // Params travel via a temp file, not argv — macOS caps command-line
    // arguments at ARG_MAX (~256 KB) and email bodies can exceed that.
    let paramsPath: string | null = null;
    if (params) {
      paramsPath = join(
        tmpdir(),
        `bearlymail-apple-mail-params-${randomUUID()}.json`,
      );
      // Owner-only (0600) since the params may carry email bodies; the name is
      // already unguessable via randomUUID (CWE-377 insecure temporary file).
      await fs.writeFile(paramsPath, JSON.stringify(params), {
        encoding: "utf8",
        mode: 0o600,
      });
      args.push(paramsPath);
    }

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          "osascript",
          args,
          { timeout: timeoutMs, maxBuffer: MAX_STDOUT_BYTES },
          (error, out, stderr) => {
            if (error) {
              reject(
                new Error(
                  `osascript failed: ${stderr?.trim() || error.message}`,
                ),
              );
              return;
            }
            resolve(out);
          },
        );
      });

      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error("osascript returned no output");
      }
      try {
        return JSON.parse(trimmed) as T;
      } catch (_parseError) {
        throw new Error(
          `osascript returned non-JSON output: ${trimmed.substring(0, ERROR_SNIPPET_LENGTH)}`,
        );
      }
    } finally {
      if (paramsPath) {
        await fs.unlink(paramsPath).catch(() => {
          this.logger.warn(`Failed to clean up params file ${paramsPath}`);
        });
      }
    }
  }
}
