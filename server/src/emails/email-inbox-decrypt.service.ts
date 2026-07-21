import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { buildDeterministicSummary } from "../llm/email-content-cleaner";
import { parseCategoryName } from "../utils/category-name.util";
import { deriveCategorizationSource } from "./category-source.helper";
import { RawEmailRow, SYSTEM_LABELS } from "./email-inbox.types";
import { EmailProviderManager } from "./email-provider-manager.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { parseLabelsValue } from "./labels.util";

/** Display name used for the null-category (uncategorized) bucket. */
const OTHER_CATEGORY_NAME = "Other";

/**
 * Decryption and label-conversion helpers extracted from EmailInboxService.
 * Handles raw-row decryption, label normalization, and category-ID propagation.
 *
 * Extracted to keep EmailInboxService under the 800-line limit.
 */
@Injectable()
export class EmailInboxDecryptService {
  private readonly logger = new Logger(EmailInboxDecryptService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * The summary shown in the inbox list. Prefers the stored summary (LLM or
   * deterministic); when it's empty AND not still being generated, falls back to
   * a deterministic preview built from the body so the row is never blank. Body
   * is decrypted lazily here — only for the few rows lacking a summary — to keep
   * the list query cheap (most rows return immediately on the stored summary).
   */
  private deriveInboxSummary(row: RawEmailRow): string | null {
    const summary = EncryptionHelper.tryDecrypt(row.summary);
    if ((summary && summary.trim()) || row.isProcessingSummary) {
      return summary;
    }
    const preview = buildDeterministicSummary(
      EncryptionHelper.tryDecrypt(row.body),
      EncryptionHelper.tryDecrypt(row.htmlBody),
    );
    return preview || summary;
  }

  decryptRawEmailRow(row: RawEmailRow): InboxEmail {
    const labels = this.decryptEmailLabels(row);
    const priorityExplanation = this.decryptEncryptedJsonField<
      Record<string, unknown>
    >(
      row.priorityExplanation,
      `priorityExplanation for thread ${row.emailThreadId}`,
    );
    const githubMetadata = this.decryptEncryptedJsonField<unknown>(
      row.githubMetadata as string | undefined,
      `githubMetadata for thread ${row.emailThreadId}`,
    );
    return {
      id: row.id,
      userId: row.userId,
      threadId: row.threadId,
      emailThreadId: row.emailThreadId,
      messageId: row.messageId,
      googleAccountId: row.googleAccountId,
      office365AccountId: row.office365AccountId,
      zohoAccountId: row.zohoAccountId,
      from: EncryptionHelper.tryDecrypt(row.from),
      fromName: EncryptionHelper.tryDecrypt(row.fromName),
      senderJobTitle: EncryptionHelper.tryDecrypt(row.senderJobTitle),
      subject: EncryptionHelper.tryDecrypt(row.subject),
      priorityExplanation,
      isSnoozed: row.isSnoozed,
      snoozeUntil: row.snoozeUntil,
      isBatched: row.isBatched,
      batchReleaseAt: row.batchReleaseAt,
      wasDeliveredEarly: row.wasDeliveredEarly,
      batchDecisionReason: row.batchDecisionReason,
      isRead: row.isRead,
      summary: this.deriveInboxSummary(row),
      isProcessingPriority: row.isProcessingPriority,
      isProcessingSummary: row.isProcessingSummary,
      receivedAt: row.receivedAt,
      labels: labels || [],
      starCount: row.starCount,
      isArchived: row.isArchived,
      urgencyScore: row.urgencyScore,
      githubMetadata,
      threadUpdatedAt: row.threadUpdatedAt,
      // categoryName from raw SQL is encrypted ciphertext — decrypt before use.
      // EncryptionHelper.tryDecrypt() catches errors and returns the raw ciphertext (fail-open).
      category: row.categoryName
        ? parseCategoryName(
            EncryptionHelper.tryDecrypt(row.categoryName) ?? "",
          ) || OTHER_CATEGORY_NAME
        : OTHER_CATEGORY_NAME,
      categoryExplanation: row.categoryExplanation
        ? EncryptionHelper.tryDecrypt(row.categoryExplanation)
        : null,
      // Which process assigned the category (surfaced in the everyday popover).
      // Null out when the category UUID was orphaned so we don't attribute a
      // stale "Other" bucket to a process that no longer applies.
      categorizationSource: deriveCategorizationSource({
        categorySource: row.categorySource,
        protoCategoryId: row.protoCategoryId,
      }),
      protoCategoryName: row.protoCategoryName
        ? EncryptionHelper.tryDecrypt(row.protoCategoryName)
        : null,
      protoCategoryDescription: row.protoCategoryDescription
        ? EncryptionHelper.tryDecrypt(row.protoCategoryDescription)
        : null,
      correspondentEmail: row.correspondentEmail
        ? EncryptionHelper.tryDecrypt(row.correspondentEmail)
        : null,
      correspondentName: row.correspondentName
        ? EncryptionHelper.tryDecrypt(row.correspondentName)
        : null,
      phishingConfidence: row.phishingConfidence,
      phishingReason: row.phishingReason,
      priorityScore: row.priorityScore ?? null,
      // Orphaned UUID: if the LEFT JOIN returned no categoryName, the referenced
      // user_context was deleted. Null out categoryId so this email is treated as
      // truly uncategorized downstream (fixes #1404 — stale-UUID category mismatch).
      categoryId: row.categoryName ? row.categoryId : null,
      to: row.to ? EncryptionHelper.tryDecrypt(row.to) : null,
      cc: row.cc ? EncryptionHelper.tryDecrypt(row.cc) : null,
      sentByAutoResponder: row.sentByAutoResponder ?? false,
    } as InboxEmail;
  }

  decryptEmailLabels(row: RawEmailRow): string[] {
    if (!row.labels) return [];
    const decrypted = EncryptionHelper.tryDecrypt(row.labels);
    if (!decrypted) return [];
    // Accept both the canonical JSON array and the legacy Postgres array-literal
    // form (`{"INBOX",...}`) some rows were written in. parseLabelsValue never
    // throws, so a malformed value yields a single debug line (suppressed in
    // prod) instead of a WARN + full stack on every inbox load.
    const parsed = parseLabelsValue(decrypted);
    if (parsed === null) {
      this.logger.debug(
        `Unparseable labels for email ${row.id} — returning [] (re-encryption job repairs the row)`,
      );
      return [];
    }
    return Array.from(
      new Set(parsed.filter((label) => !SYSTEM_LABELS.has(label))),
    );
  }

  decryptEncryptedJsonField<T>(
    encrypted: string | undefined,
    fieldDesc: string,
  ): T | null {
    if (!encrypted) return null;
    try {
      const decrypted = EncryptionHelper.tryDecrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch {
      this.logger.warn(`Failed to decrypt/parse ${fieldDesc}`);
      return null;
    }
  }

  async convertEmailLabels(
    userId: string,
    emails: InboxEmail[],
  ): Promise<void> {
    const allLabelIds = new Set<string>();
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels))
        email.labels.forEach((id) => allLabelIds.add(id));
    }
    if (allLabelIds.size === 0) return;

    const labelNames = await this.emailProviderManager.convertLabelIdsToNames(
      userId,
      Array.from(allLabelIds),
    );
    const labelIdToName = new Map<string, string>();
    Array.from(allLabelIds).forEach((id, index) => {
      if (labelNames[index]) labelIdToName.set(id, labelNames[index]);
    });

    for (const email of emails) {
      if (!email.labels || !Array.isArray(email.labels)) continue;
      const converted = email.labels
        .map((idOrName) => {
          if (SYSTEM_LABELS.has(idOrName)) return null;
          if (labelIdToName.has(idOrName)) {
            const name = labelIdToName.get(idOrName)!;
            return SYSTEM_LABELS.has(name) ? null : name;
          }
          if (idOrName.startsWith("Label_") || idOrName.startsWith("label_"))
            return null;
          return idOrName;
        })
        .filter((label): label is string => label !== null);

      const unique = Array.from(new Set(converted));
      if (JSON.stringify(unique) !== JSON.stringify(email.labels)) {
        this.logger.debug(
          `[EmailInboxDecryptService] Updating labels for email ${email.id}`,
        );
        email.labels = unique;
        // Write through manual encryption + raw SQL, NOT repository.update().
        // repository.update() bypasses the encryptedJsonTransformer, so
        // node-postgres serialises the JS array as a Postgres array literal
        // (`{"INBOX",...}`) stored as plaintext — the same bug fixed in
        // EmailCrudService.updateEmail, and the ongoing source of pg-array
        // labels that crash JSON.parse on every subsequent inbox load.
        // EncryptionHelper.encrypt picks up the current request's per-user
        // KMS key (this method runs inside the inbox HTTP handler).
        const encryptedLabels = EncryptionHelper.encrypt(
          JSON.stringify(unique),
        );
        this.emailRepository
          .query(`UPDATE emails SET labels = $1 WHERE id = $2`, [
            encryptedLabels,
            email.id,
          ])
          .catch((err) =>
            this.logger.warn(
              `Failed to update labels for email ${email.id}`,
              err,
            ),
          );
      }
    }
  }

  assignCategoryIds(emails: InboxEmail[]): void {
    // categoryId is already the UUID from the JOIN in runInboxQuery.
    // Propagate it to category_id for client compatibility.
    for (const email of emails) {
      const em = email as InboxEmail & { category_id?: string | null };
      em.category_id = em.categoryId ?? null;
    }
  }
}
