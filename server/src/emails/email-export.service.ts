import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as archiver from "archiver";
import * as crypto from "crypto";
import { PassThrough, Readable } from "stream";
import { MoreThan, Repository } from "typeorm";

import { GMAIL_LABELS } from "../constants/email-labels";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { GITHUB_RESERVED_CATEGORY_KEYS } from "../github/github-category-override.service";
import { parseCategoryName } from "../utils/category-name.util";

/** Minimum labelled examples a category needs before it's exported as a learnable
 * class for the local model. Below this the category can't be learned reliably, so
 * we drop it as a training label (the thread keeps falling back to the LLM). Kept
 * in sync with the trainer's `TrainConfig.min_category_support`. */
export const MIN_CATEGORY_SUPPORT = 5;

/** Training weight for a user-corrected category label — a much stronger signal
 * than an LLM/model-assigned one, so the trainer counts it more (sample_weight). */
const USER_CORRECTED_LABEL_WEIGHT = 3;
const DEFAULT_LABEL_WEIGHT = 1;

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
 * 5000 gives the local category/priority model enough labelled threads to
 * train on (see the local-models brief) while staying a modest download.
 */
export const MAX_EXPORT_EMAILS = 5000;

export interface ExportEmailRecord {
  senderDomain: string;
  /**
   * SHA-256 of the lowercased sender address — a stable per-sender identity
   * feature for model training that avoids exporting the raw address.
   */
  senderHash: string | null;
  subject: string;
  body: string;
  isRead: boolean;
  isReceived: boolean;
  threadId: string | null;
  receivedAt: string | null;
  hasAttachments: boolean;
  starCount: number | null;
  category: string | null;
  /** True when the category was manually corrected by the user — a stronger
   * training label than the LLM-assigned category. */
  categoryIsUserCorrected: boolean;
  /** Where the category label came from — lets the trainer weight/trust it.
   * `user` = manual override (best), `model` = LLM/model-assigned, `none` =
   * no usable category label (Other / dropped by the support gate). */
  labelSource: "user" | "model" | "none";
  /** Sample weight for the trainer — user-corrected labels count more. */
  weight: number;
  priorityScore: number | null;
  urgencyScore: number | null;
  sentimentScore: number | null;
  userPriorityOverride: number | null;
}

/** The set of category ids that decide whether a thread's category survives as a
 * training label — see {@link EmailExportService.buildTrainingLabelGate}. */
interface TrainingLabelGate {
  /** Reserved GitHub "bot-updates" fallback categories — never a real label. */
  excludedCategoryIds: Set<string>;
  /** Categories with enough examples to be learnable. */
  learnableCategoryIds: Set<string>;
}

@Injectable()
export class EmailExportService {
  private readonly logger = new Logger(EmailExportService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
    @InjectRepository(CategoryOverride)
    private readonly categoryOverrideRepository: Repository<CategoryOverride>,
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
    const overriddenThreadIds = await this.buildOverriddenThreadIdSet(userId);
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
        records.push(
          this.toExportRecord(email, categoryMap, overriddenThreadIds),
        );
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
    opts: { trainingGate?: boolean } = {},
  ): AsyncGenerator<ExportEmailRecord> {
    const categoryMap = await this.buildCategoryMap(userId);
    const overriddenThreadIds = await this.buildOverriddenThreadIdSet(userId);

    const emails = await this.emailRepository.find({
      where: { userId },
      relations: {
        thread: true,
      },
      order: { receivedAt: "DESC" },
      take: MAX_EXPORT_EMAILS,
    });

    // Training-only label cleaning (#3/#5): drop the reserved GitHub "bot-updates"
    // fallback and categories with too few examples as training labels, so the
    // model never learns them and those threads cleanly fall back to the LLM. The
    // user-facing export (no gate) keeps every real category.
    const gate = opts.trainingGate
      ? await this.buildTrainingLabelGate(userId, emails)
      : null;

    for (const email of emails) {
      yield this.toExportRecord(email, categoryMap, overriddenThreadIds, gate);
    }
  }

  /**
   * Maps an Email entity (with its thread relation loaded) to the export
   * record shape shared by the buffered and streamed export paths. Thread-level
   * fields (category, priority, star count) are the labels the local
   * category/priority model trains on; the rest are its input features.
   */
  private toExportRecord(
    email: Email,
    categoryMap: Map<string, string>,
    overriddenThreadIds: Set<string>,
    gate: TrainingLabelGate | null = null,
  ): ExportEmailRecord {
    const thread = email.thread ?? null;
    const categoryId = thread?.categoryId ?? null;
    const isUserCorrected = thread ? overriddenThreadIds.has(thread.id) : false;
    const { category, labelSource } = this.resolveCategoryLabel(
      categoryId,
      isUserCorrected,
      categoryMap,
      gate,
    );

    return {
      senderDomain: this.extractDomainPattern(email.from),
      senderHash: this.hashSenderAddress(email.from),
      subject: email.subject ?? "",
      body: email.body ?? "",
      isRead: email.isRead,
      isReceived: this.determineIsReceived(email.labels),
      threadId: email.threadId ?? null,
      receivedAt: email.receivedAt ? email.receivedAt.toISOString() : null,
      hasAttachments:
        Array.isArray(email.attachments) && email.attachments.length > 0,
      starCount: thread?.starCount ?? null,
      category,
      categoryIsUserCorrected: isUserCorrected,
      labelSource,
      weight: isUserCorrected
        ? USER_CORRECTED_LABEL_WEIGHT
        : DEFAULT_LABEL_WEIGHT,
      priorityScore: thread?.priorityScore ?? null,
      urgencyScore: thread?.urgencyScore ?? null,
      sentimentScore: email.sentimentScore ?? null,
      userPriorityOverride: email.userPriorityOverride ?? null,
    };
  }

  /**
   * Resolves the training label + its provenance for a thread's category.
   * Under the training gate, a category is only kept as a learnable label when
   * it isn't the reserved bot-updates fallback and has enough examples — unless
   * it's a user correction, which is always trusted. Without a gate (user
   * export) the category is kept as-is.
   */
  private resolveCategoryLabel(
    categoryId: string | null,
    isUserCorrected: boolean,
    categoryMap: Map<string, string>,
    gate: TrainingLabelGate | null,
  ): { category: string | null; labelSource: "user" | "model" | "none" } {
    let usableCategoryId = categoryId;
    if (gate && categoryId) {
      const excluded = gate.excludedCategoryIds.has(categoryId);
      const learnable = gate.learnableCategoryIds.has(categoryId);
      if (excluded || (!learnable && !isUserCorrected)) {
        usableCategoryId = null;
      }
    }

    const category = usableCategoryId
      ? (categoryMap.get(usableCategoryId) ?? null)
      : null;
    if (!category) {
      return { category: null, labelSource: "none" };
    }
    return { category, labelSource: isUserCorrected ? "user" : "model" };
  }

  /**
   * Builds the training-label gate: the reserved GitHub "bot-updates" category
   * (a fallback bucket, never a real user category) and the set of categories with
   * enough labelled examples to be learnable. Also logs what the gate drops.
   */
  private async buildTrainingLabelGate(
    userId: string,
    emails: Email[],
  ): Promise<TrainingLabelGate> {
    const excludedCategoryIds =
      await this.buildReservedFallbackCategoryIdSet(userId);

    // Count unique THREADS per category, not emails: the trainer collapses each
    // thread to one example, so a single chatty thread must not inflate a rare
    // category past the support gate (that would diverge from the trainer).
    const support = new Map<string, Set<string>>();
    for (const email of emails) {
      const catId = email.thread?.categoryId;
      const threadId = email.thread?.id;
      if (catId && threadId && !excludedCategoryIds.has(catId)) {
        if (!support.has(catId)) {
          support.set(catId, new Set());
        }
        support.get(catId)?.add(threadId);
      }
    }

    const learnableCategoryIds = new Set<string>();
    let droppedRare = 0;
    for (const [catId, threadIds] of support) {
      if (threadIds.size >= MIN_CATEGORY_SUPPORT) {
        learnableCategoryIds.add(catId);
      } else {
        droppedRare++;
      }
    }

    this.logger.log(
      `Training export gate for user ${userId}: ${learnableCategoryIds.size} learnable categories, ` +
        `${droppedRare} rare categories (<${MIN_CATEGORY_SUPPORT} examples) relabelled to Other, ` +
        `${excludedCategoryIds.size} reserved bot-updates categories excluded`,
    );

    return { excludedCategoryIds, learnableCategoryIds };
  }

  /** Category ids for the reserved GitHub "bot-updates" fallback (excluded as a label). */
  private async buildReservedFallbackCategoryIdSet(
    userId: string,
  ): Promise<Set<string>> {
    const reserved = await this.userContextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        categoryKey: GITHUB_RESERVED_CATEGORY_KEYS.BOT_UPDATES,
      },
      select: { contextId: true },
    });
    return new Set(reserved.map((ctx) => ctx.contextId));
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
  ): { archive: Readable; recordCount: () => number } {
    const counter = { count: 0 };

    // archiver streams are userland readable-stream instances, not core
    // node:stream Readables, and @aws-sdk/lib-storage rejects them ("Body Data
    // is unsupported format"). Pipe through a core PassThrough so S3 receives
    // a real core stream.
    const body = new PassThrough();
    // Keep a permanent error listener: archiver's pipe machinery re-emits
    // 'error' on the destination, and an EventEmitter 'error' with no listener
    // crashes the worker. Consumers still observe the failure — async
    // iteration (which @aws-sdk/lib-storage uses) rejects on a destroyed
    // stream regardless of when it attaches.
    body.on("error", () => undefined);

    // The JSON source must never error inside archiver — archiver re-emits
    // entry-source errors on internal streams with no listeners (unhandled
    // error) and never surfaces them to the consumer, which would hang the S3
    // upload and leave the export job stuck in "running". Instead, catch the
    // failure here and abort the output stream directly so the upload rejects.
    const jsonStream = Readable.from(
      this.yieldRecordsAbortingOnError(userId, counter, (err) =>
        body.destroy(err),
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive = (archiver as any).create("zip-encrypted", {
      zlib: { level: 8 },
      encryptionMethod: "zip20",
      password,
    }) as archiver.Archiver;

    archive.append(jsonStream, { name: "emails.json" });
    // Don't await: finalize streams the entries. If the archive itself errors,
    // surface it on the output stream so the S3 upload (its consumer) rejects.
    archive.finalize().catch((err) => archive.destroy(err as Error));
    archive.on("error", (err: Error) => body.destroy(err));
    archive.pipe(body);

    // pipe() never destroys its source when the destination goes away, so if
    // the consumer (the S3 upload) aborts, tear down the zip and the DB
    // generator explicitly instead of leaving them running in the background.
    body.on("close", () => {
      archive.destroy();
      jsonStream.destroy();
    });

    return { archive: body, recordCount: () => counter.count };
  }

  /**
   * Wraps {@link streamRecordsAsJson} so a failure (e.g. the DB going away
   * mid-export) ends the stream cleanly and reports the error via `onError`
   * instead of erroring the stream — see {@link buildEncryptedZipStream} for
   * why archiver must never see an erroring entry source.
   */
  private async *yieldRecordsAbortingOnError(
    userId: string,
    counter: { count: number },
    onError: (err: Error) => void,
  ): AsyncGenerator<string> {
    try {
      yield* this.streamRecordsAsJson(userId, counter);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
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
    const emailAddress = this.extractEmailAddress(from);
    if (!emailAddress) return "";

    const atIndex = emailAddress.lastIndexOf("@");
    if (atIndex === -1) return "";

    const domain = emailAddress.slice(atIndex + 1);
    if (!domain) return "";

    // Escape every regex metacharacter, not just `.`, so an address with other
    // metachars can't inject regex syntax into the pattern (incomplete
    // sanitization, CWE-116). Valid domains only contain `.`, so the exported
    // feature string is unchanged for real senders (must mirror
    // LocalModelInput.senderDomainPattern to avoid train/serve skew).
    const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `.*@${escapedDomain}$`;
  }

  /**
   * SHA-256 of the lowercased sender address, or null when no address can be
   * extracted. Gives the training pipeline a stable per-sender identity
   * without exporting the raw address.
   */
  hashSenderAddress(from: string | null | undefined): string | null {
    const emailAddress = this.extractEmailAddress(from);
    if (!emailAddress || !emailAddress.includes("@")) return null;
    return crypto
      .createHash("sha256")
      .update(emailAddress.toLowerCase())
      .digest("hex");
  }

  /**
   * Pulls the bare address out of a raw From header. Handles both bare
   * addresses (`user@example.com`) and RFC 5322 display-name form
   * (`"Display Name" <user@example.com>`).
   */
  private extractEmailAddress(from: string | null | undefined): string {
    if (!from) return "";
    const angleMatch = from.match(/<([^>]+)>/);
    return angleMatch ? angleMatch[1].trim() : from.trim().split(/\s+/)[0];
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
   * Returns the set of EmailThread ids whose category the user has manually
   * corrected at least once. A single upfront query — the set is used to flag
   * user-corrected labels on every exported record.
   */
  private async buildOverriddenThreadIdSet(
    userId: string,
  ): Promise<Set<string>> {
    const overrides = await this.categoryOverrideRepository.find({
      where: { userId },
      select: { emailThreadId: true },
    });
    return new Set(overrides.map((override) => override.emailThreadId));
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
