import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import { MoreThan, Repository } from "typeorm";

import { GMAIL_LABELS } from "../constants/email-labels";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { parseCategoryName } from "../utils/category-name.util";

const SCRYPT_KEY_LENGTH = 32;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 8;
const EXPORT_BATCH_SIZE = 500;

export const EXPORT_ALGORITHM = "aes-256-gcm" as const;
export const EXPORT_KEY_DERIVATION = "scrypt" as const;
export type ExportAlgorithm = typeof EXPORT_ALGORITHM;
export type ExportKeyDerivation = typeof EXPORT_KEY_DERIVATION;

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
   * Streams the user's emails through an AES-256-GCM cipher in fixed-size
   * batches so that only `EXPORT_BATCH_SIZE` Email entities are decoded into
   * memory at a time. The accumulated ciphertext hex string is still held in
   * memory until the response is returned; switching to a streaming HTTP
   * response or temporary file would lift that final cap for very large
   * mailboxes. The output is a single colon-delimited hex string
   * `salt:iv:authTag:ciphertext` whose plaintext (when decrypted) is a JSON
   * array of {@link ExportEmailRecord}.
   *
   * Batches are fetched with keyset pagination (`WHERE id > lastId`) rather
   * than OFFSET so that performance does not degrade as the export walks
   * through a large `emails` table.
   *
   * Category names are resolved by pre-loading the user's EMAIL_CATEGORY
   * contexts once before the batch loop and building an in-memory map, so
   * there is only one extra DB round-trip regardless of mailbox size.
   */
  async exportEmails(userId: string, password: string): Promise<string> {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Export password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const categoryMap = await this.buildCategoryMap(userId);

    const salt = crypto.randomBytes(SALT_BYTE_LENGTH);
    const key = await this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_BYTE_LENGTH);
    const cipher = crypto.createCipheriv(
      EXPORT_ALGORITHM,
      key,
      iv,
    ) as crypto.CipherGCM;

    let encrypted = cipher.update("[", "utf8", "hex");
    let isFirst = true;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.emailRepository.find({
        where: {
          userId,
          ...(lastId ? { id: MoreThan(lastId) } : {}),
        },
        relations: ["thread"],
        order: { id: "ASC" },
        take: EXPORT_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const email of batch) {
        const categoryId = email.thread?.categoryId ?? null;
        const record: ExportEmailRecord = {
          senderDomain: this.extractDomainPattern(email.from),
          subject: email.subject ?? "",
          body: email.body ?? "",
          isRead: email.isRead,
          isReceived: this.determineIsReceived(email.labels),
          category: categoryId ? (categoryMap.get(categoryId) ?? null) : null,
        };
        const chunk = (isFirst ? "" : ",") + JSON.stringify(record);
        encrypted += cipher.update(chunk, "utf8", "hex");
        isFirst = false;
      }

      if (batch.length < EXPORT_BATCH_SIZE) break;
      lastId = batch[batch.length - 1].id;
    }

    encrypted += cipher.update("]", "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return [
      salt.toString("hex"),
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted,
    ].join(":");
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

  /**
   * AES-256-GCM encrypts `plaintext` using a key derived from `password` via
   * scrypt. Returns a single colon-delimited hex string
   * `salt:iv:authTag:ciphertext` that contains everything needed for
   * decryption.
   *
   * Uses async scrypt so callers don't block the event loop while the KDF
   * runs.
   */
  async encryptExport(plaintext: string, password: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_BYTE_LENGTH);
    const key = await this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_BYTE_LENGTH);
    const cipher = crypto.createCipheriv(
      EXPORT_ALGORITHM,
      key,
      iv,
    ) as crypto.CipherGCM;
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return [
      salt.toString("hex"),
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted,
    ].join(":");
  }

  private async buildCategoryMap(userId: string): Promise<Map<string, string>> {
    const contexts = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: ["contextId", "contextValue"],
    });
    return new Map(
      contexts.map((ctx) => [
        ctx.contextId,
        parseCategoryName(ctx.contextValue),
      ]),
    );
  }

  private deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }
}
