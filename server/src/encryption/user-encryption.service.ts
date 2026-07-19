import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../database/entities/user.entity";
import { encryptionKeyProvider } from "./encryption-key-provider";
import { KmsEncryptionService } from "./kms-encryption.service";
import { runWithUserKey } from "./user-encryption-context";
import { userKeyCache } from "./user-key-cache";

/**
 * Resolves the per-user AES data key for KMS envelope encryption.
 *
 * When KMS is disabled (no `KMS_KEY_ID`), always returns the global derived key —
 * behaviour is identical to the pre-KMS implementation.
 *
 * When KMS is enabled:
 *  - On first request for a user, generates a new data key via `KMS.GenerateDataKey`,
 *    stores the KMS-encrypted ciphertext in `users.encryptedDataKey`, and caches the
 *    plaintext key for 5 minutes.
 *  - On subsequent requests, decrypts the stored ciphertext via `KMS.Decrypt` (cached).
 *
 * Background workers (PgBoss processors) do not go through the HTTP interceptor, so they
 * lack the ALS context. They must call `runWithUserKey()` explicitly before processing:
 *
 *   await this.userEncryptionService.withUserKey(userId, async () => {
 *     // TypeORM transformers will use the user key here
 *   });
 */
@Injectable()
export class UserEncryptionService {
  private readonly logger = new Logger(UserEncryptionService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly kmsService: KmsEncryptionService,
  ) {}

  async getUserKey(userId: string): Promise<Buffer> {
    // No KMS configured — e.g. local development, or any environment that has
    // not enabled envelope encryption. All data is under the global key, so
    // return it directly. This is the supported way to run without KMS: leave
    // KMS_KEY_ID unset. (`withUserKey()` likewise no-ops in this mode.)
    if (!this.kmsService.isEnabled()) {
      return encryptionKeyProvider.getGlobalKey();
    }

    const cached = userKeyCache.get(userId);
    if (cached) return cached;

    const user = await this.userRepository
      .createQueryBuilder("u")
      .select(["u.id", "u.encryptedDataKey"])
      .where("u.id = :id", { id: userId })
      .getOne();

    if (!user) {
      throw new Error(`User ${userId} not found for encryption key lookup`);
    }

    let plaintextKey: Buffer;

    try {
      if (user.encryptedDataKey) {
        plaintextKey = await this.kmsService.decryptDataKey(
          Buffer.from(user.encryptedDataKey, "base64"),
        );
      } else {
        plaintextKey = await this.provisionNewKey(userId);
      }
    } catch (kmsError) {
      // When KMS is ENABLED we must NOT fall back to the global key on failure.
      //
      // The user's data is encrypted under their per-user KMS data key — a
      // different, unrelated key. The global key cannot decrypt it, and (worse)
      // returning the global key here would make every *write* in this
      // request/job context encrypt under the wrong key, producing
      // unrecoverable split-brain data once the static global key is retired.
      // That is the exact corruption we must avoid; it is the inverse of the
      // safe per-column *read* fallback in `EncryptionHelper.tryDecrypt()`.
      //
      // KMS failures are usually transient, so throwing lets the caller's retry
      // (PgBoss `retryLimit` / SQS redrive) recover; a persistent failure
      // surfaces loudly instead of silently corrupting data. To run without KMS
      // entirely, leave `KMS_KEY_ID` unset (handled at the top of this method).
      const reason = String(kmsError);
      this.logger.error(
        `KMS key resolution failed for user ${userId}: ${reason}. ` +
          `Not falling back to the global key (that would corrupt per-user-encrypted data). ` +
          `Retryable; if KMS is intentionally disabled, unset KMS_KEY_ID.`,
        kmsError instanceof Error ? kmsError.stack : undefined,
      );
      const wrapped = new Error(
        `KMS key resolution failed for user ${userId}: ${reason}`,
      );
      (wrapped as Error & { cause?: unknown }).cause = kmsError;
      throw wrapped;
    }

    userKeyCache.set(userId, plaintextKey);
    return plaintextKey;
  }

  /**
   * Wraps `task` with the user's AES data key in AsyncLocalStorage.
   * Background workers (PgBoss job processors) must call this before accessing
   * any TypeORM entities with encrypted columns when KMS is enabled.
   */
  async withUserKey<T>(userId: string, task: () => Promise<T>): Promise<T> {
    if (!this.kmsService.isEnabled()) {
      return task();
    }
    const key = await this.getUserKey(userId);
    return runWithUserKey(key, task);
  }

  invalidateCachedKey(userId: string): void {
    userKeyCache.invalidate(userId);
  }

  /**
   * Provisions a new KMS data key for a user using a conditional UPDATE to prevent
   * a race condition where two concurrent requests both see encryptedDataKey = null
   * and generate separate keys (the later overwrite would make earlier data unreadable).
   */
  private async provisionNewKey(userId: string): Promise<Buffer> {
    this.logger.log(`Generating new KMS data key for user ${userId}`);
    const { plaintextKey: newKey, encryptedKey } =
      await this.kmsService.generateDataKey();

    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ encryptedDataKey: encryptedKey.toString("base64") })
      .where("id = :id AND encryptedDataKey IS NULL", { id: userId })
      .execute();

    if (result.affected === 0) {
      // Another concurrent request already provisioned a key — use that one instead.
      const refreshed = await this.userRepository
        .createQueryBuilder("u")
        .select(["u.id", "u.encryptedDataKey"])
        .where("u.id = :id", { id: userId })
        .getOne();

      if (!refreshed?.encryptedDataKey) {
        throw new Error(
          `Race condition resolved but encryptedDataKey still missing for user ${userId}`,
        );
      }

      return this.kmsService.decryptDataKey(
        Buffer.from(refreshed.encryptedDataKey, "base64"),
      );
    }

    return newKey;
  }
}
