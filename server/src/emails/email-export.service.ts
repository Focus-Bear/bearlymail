import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as archiver from "archiver";
import { Readable } from "stream";
import { MoreThan, Repository } from "typeorm";

import { GMAIL_LABELS } from "../constants/email-labels";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { parseCategoryName } from "../utils/category-name.util";

// archiver-zip-encrypted has no @types package; loaded via require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverZipEncrypted = require("archiver-zip-encrypted");
archiver.registerFormat("zip-encrypted", archiverZipEncrypted);

export const MIN_PASSWORD_LENGTH = 8;
const EXPORT_BATCH_SIZE = 500;

/**
 * Hard cap on how many emails an export includes. A full mailbox can be tens of
 * thousands of messages; capping at the most recent N keeps the export fast and
 * its memory/size bounded. Raise with care (the build streams, so it scales).
 */
export const MAX_EXPORT_EMAILS = 500;

export interface ExportEmailRecord {
  senderDomain: string;
  subject: string;
  body: string;
  isRead: boolean;
  isReceived: boolean;
  category: string | null;
}

@Injectable()
export class EmailExportService {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
  ) {}

  /**
   * Fetches all emails for the user and returns them as a plaintext array of
   * {@link ExportEmailRecord} objects. Emails are fetched in keyset-paginated
   * batches of `EXPORT_BATCH_SIZE` so that only a fixed number of TypeORM
   * entities are in memory at once. Category names are resolved from a
   * pre-loaded map built with a single extra DB round-trip.
   *
   * The returned records contain already-decrypted field values — TypeORM
   * column transformers handle AES-256-GCM decryption automatically when
   * entities are loaded via the repository.
   */
  async getExportableEmails(userId: string): Promise<ExportEmailRecord[]> {
    const categoryMap = await this.buildCategoryMap(userId);
    const records: ExportEmailRecord[] = [];
    let lastId: string | undefined;

    while (true) {
      const batch = await this.emailRepository.find({
        where: {
          userId,
          ...(lastId ? { id: MoreThan(lastId) } : {}),
        },
        relations: {
          thread: true,
        },
        order: { id: "ASC" },
        take: EXPORT_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const email of batch) {
        const categoryId = email.thread?.categoryId ?? null;
        records.push({
          senderDomain: this.extractDomainPattern(email.from),
          subject: email.subject ?? "",
          body: email.body ?? "",
          isRead: email.isRead,
          isReceived: this.determineIsReceived(email.labels),
          category: categoryId ? (categoryMap.get(categoryId) ?? null) : null,
        });
      }

      if (batch.length < EXPORT_BATCH_SIZE) break;
      lastId = batch[batch.length - 1].id;
    }

    return records;
  }

  /**
   * Exports all emails for the user as a password-protected ZIP file.
   * The ZIP uses ZipCrypto (PKZIP 2.0) encryption so it can be opened with the
   * built-in tools on macOS (Archive Utility) and Windows (Explorer → Extract All)
   * without needing third-party software. The JSON inside is fully decrypted.
   */
  async exportEmails(userId: string, password: string): Promise<Buffer> {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Export password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const records = await this.getExportableEmails(userId);
    return this.createEncryptedZip(JSON.stringify(records, null, 2), password);
  }

  /**
   * Wraps `content` in a password-protected ZIP file using ZipCrypto (zip20),
   * the traditional PKWARE encryption format natively supported by macOS
   * Archive Utility and Windows Explorer.
   */
  async createEncryptedZip(content: string, password: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const archive = (archiver as any).create("zip-encrypted", {
        zlib: { level: 8 },
        encryptionMethod: "zip20",
        password,
      }) as archiver.Archiver;

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);

      archive.append(content, { name: "emails.json" });
      archive.finalize();
    });
  }

  /**
   * Streams the most recent {@link MAX_EXPORT_EMAILS} emails as
   * {@link ExportEmailRecord}s. The cap bounds the export's size and memory; the
   * records are yielded one at a time (nothing accumulated) so the downstream
   * zip/upload stays streamed end to end.
   *
   * Must run inside the caller's `withUserKey` context so the TypeORM
   * transformers decrypt under the user's key.
   */
  async *streamExportableRecords(
    userId: string,
  ): AsyncGenerator<ExportEmailRecord> {
    const categoryMap = await this.buildCategoryMap(userId);

    const emails = await this.emailRepository.find({
      where: { userId },
      relations: {
        thread: true,
      },
      order: { receivedAt: "DESC" },
      take: MAX_EXPORT_EMAILS,
    });

    for (const email of emails) {
      const categoryId = email.thread?.categoryId ?? null;
      yield {
        senderDomain: this.extractDomainPattern(email.from),
        subject: email.subject ?? "",
        body: email.body ?? "",
        isRead: email.isRead,
        isReceived: this.determineIsReceived(email.labels),
        category: categoryId ? (categoryMap.get(categoryId) ?? null) : null,
      };
    }
  }

  /**
   * Builds the password-protected ZIP as a fully streamed pipeline:
   * DB batches → incremental JSON → zip. The returned `archive` is a Readable
   * the caller pipes straight to S3; the ZIP is never buffered in memory.
   *
   * `recordCount()` returns the number of emails written so far — call it after
   * the archive has been fully consumed to get the final count.
   */
  buildEncryptedZipStream(
    userId: string,
    password: string,
  ): { archive: archiver.Archiver; recordCount: () => number } {
    const counter = { count: 0 };

    const jsonStream = Readable.from(this.streamRecordsAsJson(userId, counter));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive = (archiver as any).create("zip-encrypted", {
      zlib: { level: 8 },
      encryptionMethod: "zip20",
      password,
    }) as archiver.Archiver;

    archive.append(jsonStream, { name: "emails.json" });
    // Don't await: finalize streams the entries. If the source errors, surface
    // it on the archive stream so the S3 upload (its consumer) rejects.
    archive.finalize().catch((err) => archive.destroy(err as Error));

    return { archive, recordCount: () => counter.count };
  }

  /**
   * Yields the records as the chunks of a JSON array (`[ {…}, {…} ]`), counting
   * each emitted record into `counter`. Kept private — callers use
   * {@link buildEncryptedZipStream}.
   */
  private async *streamRecordsAsJson(
    userId: string,
    counter: { count: number },
  ): AsyncGenerator<string> {
    yield "[";
    let first = true;
    for await (const record of this.streamExportableRecords(userId)) {
      yield (first ? "\n" : ",\n") + JSON.stringify(record, null, 2);
      first = false;
      counter.count += 1;
    }
    yield "\n]\n";
  }

  /**
   * Extracts the sender domain from a raw From header value and formats it as
   * a regex pattern that matches any address at that domain.
   *
   * Handles both bare addresses (`user@example.com`) and RFC 5322 display-name
   * form (`"Display Name" <user@example.com>`).
   */
  extractDomainPattern(from: string | null | undefined): string {
    if (!from) return "";

    const angleMatch = from.match(/<([^>]+)>/);
    const emailAddress = angleMatch
      ? angleMatch[1].trim()
      : from.trim().split(/\s+/)[0];

    const atIndex = emailAddress.lastIndexOf("@");
    if (atIndex === -1) return "";

    const domain = emailAddress.slice(atIndex + 1);
    if (!domain) return "";

    const escapedDomain = domain.replace(/\./g, "\\.");
    return `.*@${escapedDomain}$`;
  }

  /**
   * Returns true when the email was received (not sent by the user).
   * Sent emails carry the "SENT" system label; received emails do not.
   */
  determineIsReceived(labels: string[] | null | undefined): boolean {
    if (!Array.isArray(labels)) return true;
    return !labels.includes(GMAIL_LABELS.SENT);
  }

  private async buildCategoryMap(userId: string): Promise<Map<string, string>> {
    const contexts = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
        contextValue: true,
      },
    });
    return new Map(
      contexts.map((ctx) => [
        ctx.contextId,
        parseCategoryName(ctx.contextValue),
      ]),
    );
  }
}
