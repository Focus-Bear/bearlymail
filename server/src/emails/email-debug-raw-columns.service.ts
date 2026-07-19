import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import {
  GitHubService,
  isGitHubNotificationEmail,
  ParsedGitHubLink,
} from "../github/github.service";

export type Classification =
  | "null"
  | "encrypted"
  | "pg-array-literal"
  | "json-array"
  | "json-object"
  | "plain-string";

export interface ColumnInfo {
  /** Bounded preview of the raw column value, never the full secret. */
  preview: string | null;
  classification: Classification;
  length: number | null;
}

const ENCRYPTED_RE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;
const PREVIEW_LENGTH = 200;

function classify(value: string | null): Classification {
  if (value === null) return "null";
  if (ENCRYPTED_RE.test(value)) return "encrypted";
  if (value.startsWith('{"')) return "pg-array-literal";
  if (value.startsWith("[")) return "json-array";
  if (value.startsWith("{")) return "json-object";
  return "plain-string";
}

function describe(value: string | null): ColumnInfo {
  if (value === null) {
    return { preview: null, classification: "null", length: null };
  }
  return {
    preview: value.slice(0, PREVIEW_LENGTH),
    classification: classify(value),
    length: value.length,
  };
}

export interface GitHubScanResult {
  bodyClassification: Classification;
  bodyDecrypted: boolean;
  htmlBodyClassification: Classification;
  htmlBodyDecrypted: boolean;
  fromClassification: Classification;
  isGitHubNotification: boolean;
  linksFound: ParsedGitHubLink[];
}

/**
 * Admin-only debug helper: returns the raw stored bytes for an email's encrypted
 * columns so we can diagnose corruption without needing direct DB access.
 *
 * Never returns decrypted plaintext — only previews and a structural classification
 * (encrypted / pg-array-literal / json-array / etc.) so we can tell at a glance
 * whether the column was written through the column transformer or bypassed it.
 *
 * The endpoint that calls this helper is gated by AdminGuard, so we deliberately
 * do NOT scope by userId here — admins need to inspect any user's email when
 * debugging cross-account issues.
 */
@Injectable()
export class EmailDebugRawColumnsService {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly githubService: GitHubService,
  ) {}

  async getRawColumns(emailId: string) {
    const rows = await this.emailRepository.query(
      `SELECT id, "userId", "messageId", "threadId",
              "from", subject, labels, attachments, "actionItemsJson", summary,
              body, "htmlBody"
       FROM emails
       WHERE id = $1`,
      [emailId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    const row = rows[0];
    return {
      id: row.id,
      userId: row.userId,
      messageId: row.messageId,
      threadId: row.threadId,
      columns: {
        from: describe(row.from),
        subject: describe(row.subject),
        labels: describe(row.labels),
        attachments: describe(row.attachments),
        actionItemsJson: describe(row.actionItemsJson),
        summary: describe(row.summary),
        body: describe(row.body),
        htmlBody: describe(row.htmlBody),
      },
    };
  }

  async scanGitHubLinks(emailId: string): Promise<GitHubScanResult> {
    const rows = await this.emailRepository.query(
      `SELECT body, "htmlBody", "from" FROM emails WHERE id = $1`,
      [emailId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    const row = rows[0];

    const bodyClassification = classify(row.body);
    const decryptedBody = EncryptionHelper.tryDecrypt(row.body) ?? "";
    const bodyDecrypted = ENCRYPTED_RE.test(row.body ?? "")
      ? decryptedBody !== ""
      : true;

    const htmlBodyClassification = classify(row.htmlBody);
    const decryptedHtml = row.htmlBody
      ? (EncryptionHelper.tryDecrypt(row.htmlBody) ?? undefined)
      : undefined;
    const htmlBodyDecrypted = ENCRYPTED_RE.test(row.htmlBody ?? "")
      ? decryptedHtml !== undefined && decryptedHtml !== ""
      : true;

    const fromClassification = classify(row.from);
    const decryptedFrom = EncryptionHelper.tryDecrypt(row.from) ?? "";
    const isGitHubNotification = isGitHubNotificationEmail(decryptedFrom);

    const linksFound = this.githubService.parseGitHubLinks(
      decryptedBody,
      decryptedHtml,
    );

    return {
      bodyClassification,
      bodyDecrypted,
      htmlBodyClassification,
      htmlBodyDecrypted,
      fromClassification,
      isGitHubNotification,
      linksFound,
    };
  }
}
