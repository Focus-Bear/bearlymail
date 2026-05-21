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
  STORAGE_KIND,
} from "./encrypted-table-metadata";

const BATCH_SIZE = 100;

/**
 * Cap on retained per-row failure details per (user, table). Failures beyond
 * this still count toward `rowsFailed` but their diagnostics are dropped so
 * the PgBoss job output (a JSON blob in pg) cannot grow unbounded if a whole
 * table is broken.
 */
const MAX_FAILURES_RETAINED_PER_TABLE = 20;

/**
 * Length (in hex chars) of the prefix and suffix snippets kept on each
 * failure diagnostic. Long enough to be distinguishable in a UI cell,
 * short enough to keep the JSON output bounded. Always pulled from
 * ciphertext only — never plaintext, so this leaks nothing.
 */
const CIPHERTEXT_SAMPLE_HEX_CHARS = 12;

export type ReencryptionFailureReason =
  /** Ciphertext decrypts under neither the current user KMS key nor the legacy global key. */
  | "neither_key"
  /** All key attempts succeeded but EncryptionHelper.encrypt returned null when re-wrapping. */
  | "encrypt_failed"
  /** Catch-all for unexpected errors (shouldn't happen — investigate if seen). */
  | "unknown";

export interface ReencryptionFailureDetail {
  table: string;
  rowId: string;
  column: string;
  reason: ReencryptionFailureReason;
  ivHexLen: number;
  tagHexLen: number;
  bodyHexLen: number;
  totalLen: number;
  prefix: string;
  suffix: string;
  errorMessage: string;
}

export interface TableReencryptionResult {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
  failures: ReencryptionFailureDetail[];
}

export interface UserReencryptionResult {
  userId: string;
  dryRun: boolean;
  tables: TableReencryptionResult[];
}

interface FailureContext {
  column: string;
  reason: ReencryptionFailureReason;
  ciphertext: string;
  errorMessage: string;
}

type ReencryptColumnsResult =
  | { kind: "alreadyMigrated" }
  | { kind: "noEncryptedValues" }
  | { kind: "rewriteNeeded"; values: Record<string, string> }
  | { kind: "rowFailure"; failure: FailureContext };

/**
 * Decompose a stored ciphertext (`ivHex:tagHex:bodyHex`) for diagnostics.
 * Pure — never reveals plaintext, only shape.
 */
function describeCiphertextShape(ciphertext: string): {
  ivHexLen: number;
  tagHexLen: number;
  bodyHexLen: number;
  totalLen: number;
  prefix: string;
  suffix: string;
} {
  const parts = ciphertext.split(":");
  return {
    ivHexLen: (parts[0] ?? "").length,
    tagHexLen: (parts[1] ?? "").length,
    bodyHexLen: (parts[2] ?? "").length,
    totalLen: ciphertext.length,
    prefix: ciphertext.slice(0, CIPHERTEXT_SAMPLE_HEX_CHARS),
    suffix: ciphertext.slice(-CIPHERTEXT_SAMPLE_HEX_CHARS),
  };
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

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly kmsService: KmsEncryptionService,
  ) {}

  /**
   * Discover tables on every call rather than caching at constructor time.
   *
   * `EncryptionModule` is `@Global()` and constructs early. Modules that use
   * `forwardRef()` (EmailsModule etc.) finish wiring `forFeature` entities
   * later — caching at constructor time produces an incomplete metadata
   * snapshot and silently drops tables like `emails`, `email_threads`, and
   * `user_contexts`. Walking `dataSource.entityMetadatas` is O(N entities)
   * and cheap; the dry-run/real-run is the only caller and runs minutes per
   * user, so the overhead is invisible.
   */
  getTables(): readonly EncryptedTable[] {
    return discoverEncryptedTables(this.dataSource);
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
    const tables = this.getTables();
    this.logger.log(
      `Re-encrypting ${tables.length} tables for user ${userId}: ${tables
        .map((tbl) => tbl.tableName)
        .join(", ")}`,
    );

    await runWithUserKey(userKey, async () => {
      for (const table of tables) {
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
    const failures: ReencryptionFailureDetail[] = [];

    while (true) {
      const {
        batchScanned,
        batchRewritten,
        batchAlreadyMigrated,
        batchFailed,
        batchFailures,
        lastId,
      } = await this.dataSource.transaction(async (txMgr) =>
        this.processBatch(txMgr, {
          userId,
          table,
          userKey,
          globalKey,
          cursor,
          dryRun,
          retainedFailuresSoFar: failures.length,
        }),
      );

      rowsScanned += batchScanned;
      rowsRewritten += batchRewritten;
      rowsAlreadyMigrated += batchAlreadyMigrated;
      rowsFailed += batchFailed;
      for (const failure of batchFailures) {
        if (failures.length >= MAX_FAILURES_RETAINED_PER_TABLE) break;
        failures.push(failure);
      }

      if (batchScanned < BATCH_SIZE || lastId === null) break;
      cursor = lastId;
    }

    return {
      table: table.tableName,
      rowsScanned,
      rowsRewritten,
      rowsAlreadyMigrated,
      rowsFailed,
      failures,
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
      retainedFailuresSoFar: number;
    },
  ): Promise<{
    batchScanned: number;
    batchRewritten: number;
    batchAlreadyMigrated: number;
    batchFailed: number;
    batchFailures: ReencryptionFailureDetail[];
    lastId: string | null;
  }> {
    const {
      userId,
      table,
      userKey,
      globalKey,
      cursor,
      dryRun,
      retainedFailuresSoFar,
    } = opts;
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
    const batchFailures: ReencryptionFailureDetail[] = [];

    for (const row of rows) {
      const rowId = row[table.primaryKeyColumn] as string;
      const outcome = this.classifyRow(table, row, userKey, globalKey);

      switch (outcome.kind) {
        case "alreadyMigrated":
        case "noEncryptedValues":
          batchAlreadyMigrated++;
          break;
        case "rewriteNeeded":
          if (!dryRun) {
            await this.applyUpdate(txMgr, table, rowId, outcome.values);
          }
          batchRewritten++;
          break;
        case "rowFailure": {
          batchFailed++;
          const failure = this.buildFailureDetail(
            table.tableName,
            rowId,
            outcome.failure,
          );
          this.logFailure(failure);
          if (
            retainedFailuresSoFar + batchFailures.length <
            MAX_FAILURES_RETAINED_PER_TABLE
          ) {
            batchFailures.push(failure);
          }
          break;
        }
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
      batchFailures,
      lastId,
    };
  }

  /**
   * Wraps `computeReencryptedColumns` so an unexpected synchronous throw
   * (which shouldn't happen — the function returns tagged failures by
   * design) is captured as a `failure` outcome with `reason: "unknown"`
   * rather than aborting the whole batch.
   */
  private classifyRow(
    table: EncryptedTable,
    row: Record<string, string | null>,
    userKey: Buffer,
    globalKey: Buffer,
  ): ReencryptColumnsResult {
    try {
      return this.computeReencryptedColumns(table, row, userKey, globalKey);
    } catch (err) {
      return {
        kind: "rowFailure",
        failure: {
          column: "(unknown)",
          reason: "unknown",
          ciphertext: "",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private logFailure(failure: ReencryptionFailureDetail): void {
    this.logger.warn(
      `Re-encrypt failed for ${failure.table}.${failure.rowId} column="${failure.column}" reason=${failure.reason} ivHexLen=${failure.ivHexLen} tagHexLen=${failure.tagHexLen} bodyHexLen=${failure.bodyHexLen} prefix=${failure.prefix} suffix=${failure.suffix} err=${failure.errorMessage}`,
    );
  }

  private buildFailureDetail(
    tableName: string,
    rowId: string,
    failure: FailureContext,
  ): ReencryptionFailureDetail {
    const shape = describeCiphertextShape(failure.ciphertext);
    return {
      table: tableName,
      rowId,
      column: failure.column,
      reason: failure.reason,
      ...shape,
      errorMessage: failure.errorMessage,
    };
  }

  /**
   * For each encrypted column on `row`, decide whether it needs re-encryption.
   *
   * - null / not-ciphertext-shaped → leave alone
   * - decrypts under the active per-user key → already migrated, skip
   * - decrypts under the global key → re-encrypt with the active per-user key
   * - decrypts under neither → return a `failure` outcome with the column name
   *   and ciphertext (caller records a structured failure detail). Failures
   *   are *not* thrown so the per-row try/catch only handles truly unexpected
   *   exceptions.
   */
  private computeReencryptedColumns(
    table: EncryptedTable,
    row: Record<string, string | null>,
    userKey: Buffer,
    globalKey: Buffer,
  ): ReencryptColumnsResult {
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
        return {
          kind: "rowFailure",
          failure: {
            column: col.databaseName,
            reason: "neither_key",
            ciphertext,
            errorMessage: `decrypts under neither user nor global key`,
          },
        };
      }

      const reencrypted = EncryptionHelper.encrypt(globalKeyDecrypted);
      if (reencrypted === null) {
        return {
          kind: "rowFailure",
          failure: {
            column: col.databaseName,
            reason: "encrypt_failed",
            ciphertext,
            errorMessage: `EncryptionHelper.encrypt returned null when re-wrapping under user key`,
          },
        };
      }
      updates[col.databaseName] = reencrypted;
      anyNeedingRewrite = true;
    }

    if (!anyEncryptedColumn) return { kind: "noEncryptedValues" };
    if (!anyNeedingRewrite) return { kind: "alreadyMigrated" };
    return { kind: "rewriteNeeded", values: updates };
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
      const placeholder = `$${paramIndex++}`;
      // The ciphertext is always a plain string. For json/jsonb columns the
      // value is stored as a JSON string, so a bare ciphertext is rejected as
      // "invalid input syntax for type json" (issue #2132) — wrap it server-
      // side so the param stays a plain string. Plain text columns take it as-is.
      const storageKind =
        table.columns.find((column) => column.databaseName === col)
          ?.storageKind ??
        STORAGE_KIND.TEXT;
      if (storageKind === STORAGE_KIND.JSONB) {
        setClauses.push(`"${col}" = to_jsonb(${placeholder}::text)`);
      } else if (storageKind === STORAGE_KIND.JSON) {
        setClauses.push(`"${col}" = to_json(${placeholder}::text)`);
      } else {
        setClauses.push(`"${col}" = ${placeholder}`);
      }
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
