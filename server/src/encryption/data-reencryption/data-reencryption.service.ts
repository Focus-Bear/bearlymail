import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";

import { User } from "../../database/entities/user.entity";
import { EncryptionHelper } from "../encryption.helper";
import { encryptionKeyProvider } from "../encryption-key-provider";
import { KmsEncryptionService } from "../kms-encryption.service";
import { UserEncryptionService } from "../user-encryption.service";
import { runWithUserKey } from "../user-encryption-context";
import {
  discoverEncryptedTables,
  EncryptedTable,
} from "./encrypted-table-metadata";

const BATCH_SIZE = 100;

export interface TableReencryptionResult {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
}

export interface UserReencryptionResult {
  userId: string;
  dryRun: boolean;
  tables: TableReencryptionResult[];
}

/**
 * Re-encrypts a user's row data from the legacy global ENCRYPTION_KEY ciphertext to
 * their per-user KMS-derived data key. Operates one user at a time; idempotent
 * (rows already encrypted under the user key are skipped).
 *
 * Out of scope (still readable via the global-key fallback in tryDecrypt):
 * tables scoped indirectly via foreign keys (contact_notes, contact_custom_field_values),
 * org-shared tables (organizations, organization_members), unscoped tables
 * (waitlist, feedback). These can be migrated separately if needed.
 */
@Injectable()
export class DataReencryptionService {
  private readonly logger = new Logger(DataReencryptionService.name);
  private readonly tables: EncryptedTable[];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly kmsService: KmsEncryptionService,
  ) {
    this.tables = discoverEncryptedTables(dataSource);
    this.logger.log(
      `Discovered ${this.tables.length} user-scoped encrypted tables for re-encryption`,
    );
  }

  getTables(): readonly EncryptedTable[] {
    return this.tables;
  }

  /**
   * Re-encrypts every row owned by `userId` whose encrypted columns are still under
   * the global key. Wraps each batch in a transaction with `SELECT ... FOR UPDATE`
   * so concurrent writes from live requests are serialised, not lost.
   *
   * Sets `users.dataReencryptedAt` on completion (not in dry-run mode).
   */
  async reencryptUser(
    userId: string,
    options: { dryRun?: boolean } = {},
  ): Promise<UserReencryptionResult> {
    const dryRun = options.dryRun ?? false;

    if (!this.kmsService.isEnabled()) {
      throw new Error(
        "KMS envelope encryption is not enabled — re-encryption is a no-op",
      );
    }

    const userKey = await this.userEncryptionService.getUserKey(userId);
    const globalKey = encryptionKeyProvider.getGlobalKey();
    const result: UserReencryptionResult = { userId, dryRun, tables: [] };

    await runWithUserKey(userKey, async () => {
      for (const table of this.tables) {
        const tableResult = await this.reencryptTable(
          userId,
          table,
          userKey,
          globalKey,
          dryRun,
        );
        result.tables.push(tableResult);
      }
    });

    const totalFailed = result.tables.reduce(
      (acc, tbl) => acc + tbl.rowsFailed,
      0,
    );

    if (!dryRun && totalFailed === 0) {
      await this.userRepository.update(userId, {
        dataReencryptedAt: new Date(),
      });
      this.logger.log(`Marked user ${userId} as fully re-encrypted`);
    } else if (!dryRun && totalFailed > 0) {
      this.logger.warn(
        `User ${userId} not marked as re-encrypted: ${totalFailed} row(s) failed. Re-run the job to retry.`,
      );
    }

    return result;
  }

  private async reencryptTable(
    userId: string,
    table: EncryptedTable,
    userKey: Buffer,
    globalKey: Buffer,
    dryRun: boolean,
  ): Promise<TableReencryptionResult> {
    let cursor: string | null = null;
    let rowsScanned = 0;
    let rowsRewritten = 0;
    let rowsAlreadyMigrated = 0;
    let rowsFailed = 0;

    while (true) {
      const {
        batchScanned,
        batchRewritten,
        batchAlreadyMigrated,
        batchFailed,
        lastId,
      } = await this.dataSource.transaction(async (txMgr) =>
        this.processBatch(txMgr, {
          userId,
          table,
          userKey,
          globalKey,
          cursor,
          dryRun,
        }),
      );

      rowsScanned += batchScanned;
      rowsRewritten += batchRewritten;
      rowsAlreadyMigrated += batchAlreadyMigrated;
      rowsFailed += batchFailed;

      if (batchScanned < BATCH_SIZE || lastId === null) break;
      cursor = lastId;
    }

    return {
      table: table.tableName,
      rowsScanned,
      rowsRewritten,
      rowsAlreadyMigrated,
      rowsFailed,
    };
  }

  private async processBatch(
    txMgr: EntityManager,
    opts: {
      userId: string;
      table: EncryptedTable;
      userKey: Buffer;
      globalKey: Buffer;
      cursor: string | null;
      dryRun: boolean;
    },
  ): Promise<{
    batchScanned: number;
    batchRewritten: number;
    batchAlreadyMigrated: number;
    batchFailed: number;
    lastId: string | null;
  }> {
    const { userId, table, userKey, globalKey, cursor, dryRun } = opts;
    const selectColumns = [
      table.primaryKeyColumn,
      ...table.columns.map((col) => col.databaseName),
    ]
      .map((name) => `"${name}"`)
      .join(", ");

    const cursorClause =
      cursor !== null ? `AND "${table.primaryKeyColumn}" > $2` : "";
    const params: unknown[] = cursor !== null ? [userId, cursor] : [userId];

    const rows: Array<Record<string, string | null>> = await txMgr.query(
      `SELECT ${selectColumns}
         FROM "${table.tableName}"
         WHERE "${table.userIdColumn}" = $1 ${cursorClause}
         ORDER BY "${table.primaryKeyColumn}"
         LIMIT ${BATCH_SIZE}
         FOR UPDATE`,
      params,
    );

    let batchRewritten = 0;
    let batchAlreadyMigrated = 0;
    let batchFailed = 0;

    for (const row of rows) {
      const rowId = row[table.primaryKeyColumn];
      try {
        const updates = this.computeReencryptedColumns(
          table,
          row,
          userKey,
          globalKey,
        );
        if (updates.kind === "alreadyMigrated") {
          batchAlreadyMigrated++;
          continue;
        }
        if (updates.kind === "noEncryptedValues") {
          batchAlreadyMigrated++;
          continue;
        }
        if (!dryRun) {
          await this.applyUpdate(txMgr, table, rowId as string, updates.values);
        }
        batchRewritten++;
      } catch (err) {
        batchFailed++;
        this.logger.warn(
          `Re-encrypt failed for ${table.tableName}.${rowId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const lastId =
      rows.length > 0
        ? (rows[rows.length - 1][table.primaryKeyColumn] as string)
        : null;

    return {
      batchScanned: rows.length,
      batchRewritten,
      batchAlreadyMigrated,
      batchFailed,
      lastId,
    };
  }

  /**
   * For each encrypted column on `row`, decide whether it needs re-encryption.
   *
   * - null / not-ciphertext-shaped → leave alone
   * - decrypts under the active per-user key → already migrated, skip
   * - decrypts under the global key → re-encrypt with the active per-user key
   * - decrypts under neither → throw (caller logs and counts as failed)
   */
  private computeReencryptedColumns(
    table: EncryptedTable,
    row: Record<string, string | null>,
    userKey: Buffer,
    globalKey: Buffer,
  ):
    | { kind: "alreadyMigrated" }
    | { kind: "noEncryptedValues" }
    | { kind: "rewrite"; values: Record<string, string> } {
    const updates: Record<string, string> = {};
    let anyEncryptedColumn = false;
    let anyNeedingRewrite = false;

    for (const col of table.columns) {
      const ciphertext = row[col.databaseName];
      if (ciphertext === null || ciphertext === undefined) continue;
      if (!EncryptionHelper.looksLikeEncryptedPayload(ciphertext)) continue;

      anyEncryptedColumn = true;

      // Use silentDecryptWithKey on both attempts: at scale the legacy-key path
      // is the common case, so logging on every "wrong key" attempt would flood
      // the error tracker.
      const userKeyDecrypted = EncryptionHelper.silentDecryptWithKey(
        ciphertext,
        userKey,
      );
      if (userKeyDecrypted !== null && userKeyDecrypted !== ciphertext) {
        // Already encrypted under the per-user key — skip this column.
        continue;
      }

      const globalKeyDecrypted = EncryptionHelper.silentDecryptWithKey(
        ciphertext,
        globalKey,
      );
      if (globalKeyDecrypted === null || globalKeyDecrypted === ciphertext) {
        throw new Error(
          `column "${col.databaseName}" decrypts under neither user nor global key`,
        );
      }

      const reencrypted = EncryptionHelper.encrypt(globalKeyDecrypted);
      if (reencrypted === null) {
        throw new Error(`column "${col.databaseName}" failed to re-encrypt`);
      }
      updates[col.databaseName] = reencrypted;
      anyNeedingRewrite = true;
    }

    if (!anyEncryptedColumn) return { kind: "noEncryptedValues" };
    if (!anyNeedingRewrite) return { kind: "alreadyMigrated" };
    return { kind: "rewrite", values: updates };
  }

  private async applyUpdate(
    txMgr: EntityManager,
    table: EncryptedTable,
    rowId: string,
    updates: Record<string, string>,
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    for (const [col, value] of Object.entries(updates)) {
      setClauses.push(`"${col}" = $${paramIndex++}`);
      params.push(value);
    }
    params.push(rowId);

    await txMgr.query(
      `UPDATE "${table.tableName}"
         SET ${setClauses.join(", ")}
         WHERE "${table.primaryKeyColumn}" = $${paramIndex}`,
      params,
    );
  }
}
