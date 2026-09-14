import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Organization } from "../database/entities/organization.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UserEncryptionService } from "../encryption/user-encryption.service";

/** Where a repaired name came from, for the admin summary and the audit log. */
export const REPAIR_NAME_SOURCE = {
  /** Recovered by decrypting under the owner's KMS data key — the true value. */
  OWNER_KEY: "owner-key",
  /** Owner's display name — what org creation derives the name from anyway. */
  OWNER_DISPLAY_NAME: "owner-display-name",
} as const;

export type RepairNameSource =
  (typeof REPAIR_NAME_SOURCE)[keyof typeof REPAIR_NAME_SOURCE];

export interface RepairedOrganization {
  organizationId: string;
  source: RepairNameSource;
}

export interface RepairOrganizationNamesResult {
  dryRun: boolean;
  /** Organizations examined. */
  totalScanned: number;
  /** Rows that already decrypt under the global key — left untouched. */
  totalAlreadyGlobal: number;
  /** Rows repaired (in dry-run: rows that WOULD be repaired). */
  totalRepaired: number;
  /** Rows whose name could not be recovered by either route — left as-is. */
  totalUnrecoverable: number;
  repaired: RepairedOrganization[];
  unrecoverable: string[];
}

/**
 * One-shot repair for `organizations.name` rows encrypted under a per-user KMS
 * key instead of the global key.
 *
 * The column was declared with the per-user transformer, so its key came from
 * whatever was in AsyncLocalStorage at write time: the global key when the
 * unauthenticated OAuth callback provisioned the personal org, the owner's key
 * on an authenticated write. Reads then used whatever key was in scope *then*,
 * so the two rarely agreed — the recurring `field=organizations.name
 * userKey=absent` decrypt failures. The column is now global-scoped; rows
 * already written under an owner's key need this to become readable again.
 *
 * Why a service rather than a TypeORM migration: the migration ECS task is
 * deliberately given NO encryption secrets (see migration 1794300000000), so it
 * can neither decrypt nor encrypt. Recovering a name additionally needs the
 * OWNER's KMS data key via `UserEncryptionService.withUserKey()`, which only
 * exists on the server/worker image. Same split as the category-rule
 * `categoryId` backfill and the contact searchTokens backfill (#2030).
 *
 * Idempotent: rows that already decrypt under the global key are skipped, so
 * re-running (or a PgBoss retry) resumes safely and a repaired row is never
 * touched twice.
 */
@Injectable()
export class OrganizationNameRepairService {
  private readonly logger = new Logger(OrganizationNameRepairService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async repairAll(
    options: { dryRun?: boolean } = {},
  ): Promise<RepairOrganizationNamesResult> {
    const dryRun = options.dryRun ?? false;

    // Raw rows: the entity transformer would decrypt `name` on the way out and
    // hide the very ciphertext this repair has to inspect and guard on.
    const rows: Array<{ id: string; name: string; ownerId: string }> =
      await this.organizationRepository.query(
        `SELECT id, name, "ownerId" FROM organizations`,
      );

    const result: RepairOrganizationNamesResult = {
      dryRun,
      totalScanned: rows.length,
      totalAlreadyGlobal: 0,
      totalRepaired: 0,
      totalUnrecoverable: 0,
      repaired: [],
      unrecoverable: [],
    };

    for (const row of rows) {
      if (EncryptionHelper.tryDecryptWithGlobalKey(row.name) !== null) {
        result.totalAlreadyGlobal += 1;
        continue;
      }

      const recovered = await this.recoverName(row.name, row.ownerId);
      if (!recovered) {
        result.totalUnrecoverable += 1;
        result.unrecoverable.push(row.id);
        this.logger.warn(
          `Could not recover organizations.name for org ${row.id} (owner ${row.ownerId})`,
        );
        continue;
      }

      const applied = await this.applyRepair(row, recovered.name, dryRun);
      if (!applied) {
        result.totalUnrecoverable += 1;
        result.unrecoverable.push(row.id);
        continue;
      }

      result.totalRepaired += 1;
      result.repaired.push({
        organizationId: row.id,
        source: recovered.source,
      });
    }

    this.logger.log(
      `organizations.name repair ${dryRun ? "(dry run) " : ""}done: ` +
        `scanned ${result.totalScanned}, already global ${result.totalAlreadyGlobal}, ` +
        `repaired ${result.totalRepaired}, unrecoverable ${result.totalUnrecoverable}.`,
    );
    return result;
  }

  /**
   * Recovers the row's plaintext name: first under the owner's own KMS key
   * (the true stored value, which survives an org that was renamed), then from
   * the owner's display name — what `provisionPersonalOrg` and the
   * BackfillPersonalOrgs migration derive the name from in the first place.
   */
  private async recoverName(
    cipher: string,
    ownerId: string,
  ): Promise<{ name: string; source: RepairNameSource } | null> {
    try {
      const underOwnerKey = await this.userEncryptionService.withUserKey(
        ownerId,
        async () => EncryptionHelper.tryDecrypt(cipher),
      );
      if (underOwnerKey) {
        return { name: underOwnerKey, source: REPAIR_NAME_SOURCE.OWNER_KEY };
      }
    } catch (error) {
      this.logger.warn(
        `Owner-key decrypt failed for owner ${ownerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // `users.displayName` / `users.name` use the GLOBAL key, so they read here
    // without any per-user context.
    const owner = await this.userRepository.findOne({
      where: { id: ownerId },
      select: { id: true, displayName: true, name: true },
    });
    const derived = owner?.displayName?.trim() || owner?.name?.trim();
    return derived
      ? { name: derived, source: REPAIR_NAME_SOURCE.OWNER_DISPLAY_NAME }
      : null;
  }

  /**
   * Re-encrypts under the global key and writes, guarded on the ciphertext this
   * repair actually inspected so a concurrent write is never clobbered. The
   * round-trip check means a row is only ever replaced by one that is provably
   * readable.
   */
  private async applyRepair(
    row: { id: string; name: string },
    plaintext: string,
    dryRun: boolean,
  ): Promise<boolean> {
    const reEncrypted = EncryptionHelper.encryptWithGlobalKey(plaintext);
    if (
      !reEncrypted ||
      EncryptionHelper.tryDecryptWithGlobalKey(reEncrypted) !== plaintext
    ) {
      this.logger.error(
        `Refusing to write organizations.name for org ${row.id}: round-trip check failed`,
      );
      return false;
    }
    if (dryRun) {
      return true;
    }

    // Raw SQL: a query-builder `.set({ name })` would run the column
    // transformer and encrypt the already-encrypted value a second time.
    await this.organizationRepository.query(
      `UPDATE organizations SET name = $1 WHERE id = $2 AND name = $3`,
      [reEncrypted, row.id, row.name],
    );

    const [after]: Array<{ name: string }> =
      await this.organizationRepository.query(
        `SELECT name FROM organizations WHERE id = $1`,
        [row.id],
      );
    const readsBack =
      EncryptionHelper.tryDecryptWithGlobalKey(after?.name) === plaintext;
    if (!readsBack) {
      this.logger.error(
        `organizations.name for org ${row.id} did not read back after repair`,
      );
      return false;
    }

    this.logger.log(`Repaired organizations.name for org ${row.id}`);
    return true;
  }
}
