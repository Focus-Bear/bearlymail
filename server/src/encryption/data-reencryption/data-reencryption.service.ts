import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Not, Repository } from "typeorm";

import { User } from "../../database/entities/user.entity";
import { parseLabelsValue } from "../../emails/labels.util";
import { EncryptionHelper } from "../encryption.helper";
import { encryptionKeyProvider } from "../encryption-key-provider";
import { KmsEncryptionService } from "../kms-encryption.service";
import { UserEncryptionService } from "../user-encryption.service";
import { runWithUserKey } from "../user-encryption-context";
import {
  discoverEncryptedTables,
  EncryptedColumn,
  EncryptedTable,
  STORAGE_KIND,
} from "./encrypted-table-metadata";
import {
  buildPerUserHealthQuery,
  buildTableHealthQuery,
  ColumnHealth,
  ReencryptionHealth,
  UserHealthEntry,
} from "./reencryption-health";

/** Cap on the number of most-affected users returned by the health scan. */
const TOP_AFFECTED_USERS_LIMIT = 10;

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
  /**
   * The stored value bypassed the encryption transformer (plaintext at rest,
   * typically a Postgres array literal from a legacy `repository.update()` call)
   * and the plaintext could not be canonicalised back into the column's expected
   * shape — e.g. node-pg serialised an array of objects to `{"[object Object]"}`.
   * Recoverable bypassed values are re-encrypted in place; this reason only
   * surfaces for the unrecoverable ones.
   */
  | "bypassed_unrecoverable"
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
  /**
   * Rows where at least one unrecoverable (neither-key) regenerable column was
   * WIPED (set NULL) rather than failed — see CLEARABLE_ON_DECRYPT_FAILURE.
   * These rows also count toward `rowsRewritten` (a clear is still an UPDATE);
   * this is the subset that involved discarding corrupted data.
   */
  rowsCleared: number;
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
  | {
      kind: "rewriteNeeded";
      // A `null` value means "wipe this column" (unrecoverable + regenerable);
      // a string means "re-encrypt under the user key".
      values: Record<string, string | null>;
      // Names of columns being wiped (subset of `values` with null) — used for
      // reporting/logging which corrupted fields were discarded.
      clearedColumns: string[];
    }
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

/**
 * The canonical plaintext form of a bypassed (un-encrypted-at-rest) value, as it
 * would have been produced if the write had gone through the column transformer.
 *
 * Returns null when the value cannot be safely recovered — e.g. node-postgres
 * serialised an array of OBJECTS to `{"[object Object]","[object Object]"}` and
 * the original objects are unrecoverable from those strings. The caller treats
 * null as a row failure (or clears the column when it's regenerable).
 *
 * For string columns the plaintext IS the string. For JSON columns we accept
 * (a) any value that already parses as JSON and (b) Postgres text[] literals of
 * plain strings (`{"INBOX","IMPORTANT"}`) which we convert to JSON arrays.
 */
function canonicalisePlaintextForColumn(
  value: string,
  col: EncryptedColumn,
): string | null {
  if (!col.isJson) return value;

  const trimmed = value.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    /* not valid JSON — fall through to the Postgres array-literal path */
  }

  const pgArray = parseLabelsValue(trimmed);
  if (pgArray === null) return null;
  // Reject the garbage shape that node-pg produces when an array of OBJECTS is
  // serialised to a Postgres text[]: each element becomes the literal string
  // "[object Object]". Empty elements are equally suspect.
  if (pgArray.some((el) => el === "[object Object]" || el === "")) return null;
  return JSON.stringify(pgArray);
}

/**
 * Per-column outcomes the main loop dispatches on. Named-constant form so
 * comparisons don't trigger the no-restricted-syntax magic-string rule.
 */
const COLUMN_REENCRYPT_OUTCOME = {
  /** Already encrypted under the active per-user key — leave it alone. */
  SKIP: "skip",
  /** Replace the column value with the supplied ciphertext. */
  UPDATE: "update",
  /** Wipe the column to NULL (only for clearable/regenerable columns). */
  CLEAR: "clear",
  /** Don't touch the row; record a structured failure for diagnostics. */
  FAILURE: "failure",
} as const;

type ColumnReencryptOutcome =
  | { kind: typeof COLUMN_REENCRYPT_OUTCOME.SKIP }
  | { kind: typeof COLUMN_REENCRYPT_OUTCOME.UPDATE; encrypted: string }
  | { kind: typeof COLUMN_REENCRYPT_OUTCOME.CLEAR }
  | {
      kind: typeof COLUMN_REENCRYPT_OUTCOME.FAILURE;
      reason: ReencryptionFailureReason;
      errorMessage: string;
    };

/**
 * Recover a column value that bypassed the encryption transformer at write
 * time (plaintext at rest — e.g. a Postgres array literal `{"INBOX",...}`).
 */
function reencryptBypassedPlaintext(
  value: string,
  col: EncryptedColumn,
): ColumnReencryptOutcome {
  const canonical = canonicalisePlaintextForColumn(value, col);
  if (canonical === null) {
    if (col.clearOnDecryptFailure)
      return { kind: COLUMN_REENCRYPT_OUTCOME.CLEAR };
    return {
      kind: COLUMN_REENCRYPT_OUTCOME.FAILURE,
      reason: "bypassed_unrecoverable",
      errorMessage: `bypassed transformer (plaintext at rest) and not canonicalisable to ${col.isJson ? "JSON" : "string"}`,
    };
  }
  // EncryptionHelper.encrypt returns null on falsy/empty input, which would
  // otherwise produce an `encrypt_failed` failure for a benign empty-string
  // value and block the user from being stamped `dataReencryptedAt`. Empty/
  // whitespace-only plaintext has no semantic content — leave it as-is.
  if (canonical.trim() === "") {
    return { kind: COLUMN_REENCRYPT_OUTCOME.SKIP };
  }
  const encrypted = EncryptionHelper.encrypt(canonical);
  if (encrypted === null) {
    return {
      kind: COLUMN_REENCRYPT_OUTCOME.FAILURE,
      reason: "encrypt_failed",
      errorMessage: `EncryptionHelper.encrypt returned null when wrapping bypassed plaintext under user key`,
    };
  }
  return { kind: COLUMN_REENCRYPT_OUTCOME.UPDATE, encrypted };
}

/**
 * Re-encrypt a properly-shaped ciphertext value: skip if it already decrypts
 * under the per-user key; otherwise decrypt under the legacy global key and
 * re-wrap. Mirrors the previous inline logic in `computeReencryptedColumns`;
 * extracted to keep that function under the max-statements lint budget.
 */
function reencryptCiphertextValue(
  ciphertext: string,
  col: EncryptedColumn,
  userKey: Buffer,
  globalKey: Buffer,
): ColumnReencryptOutcome {
  // silentDecryptWithKey on both attempts: at scale the legacy-key path is
  // the common case, so logging every "wrong key" attempt would flood the
  // error tracker.
  const userKeyDecrypted = EncryptionHelper.silentDecryptWithKey(
    ciphertext,
    userKey,
  );
  if (userKeyDecrypted !== null && userKeyDecrypted !== ciphertext) {
    return { kind: COLUMN_REENCRYPT_OUTCOME.SKIP };
  }

  const globalKeyDecrypted = EncryptionHelper.silentDecryptWithKey(
    ciphertext,
    globalKey,
  );
  if (globalKeyDecrypted === null || globalKeyDecrypted === ciphertext) {
    if (col.clearOnDecryptFailure)
      return { kind: COLUMN_REENCRYPT_OUTCOME.CLEAR };
    return {
      kind: COLUMN_REENCRYPT_OUTCOME.FAILURE,
      reason: "neither_key",
      errorMessage: `decrypts under neither user nor global key`,
    };
  }

  const reencrypted = EncryptionHelper.encrypt(globalKeyDecrypted);
  if (reencrypted === null) {
    return {
      kind: COLUMN_REENCRYPT_OUTCOME.FAILURE,
      reason: "encrypt_failed",
      errorMessage: `EncryptionHelper.encrypt returned null when re-wrapping under user key`,
    };
  }
  return { kind: COLUMN_REENCRYPT_OUTCOME.UPDATE, encrypted: reencrypted };
}

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
   * Scan every encrypted column and report how its values are ACTUALLY shaped
   * on disk — encrypted-at-rest vs plaintext (bypassed transformer). This is
   * the truthful health signal: a row needs remediation iff a per-user
   * encrypted column holds a non-null, non-encrypted-shaped value. Unlike the
   * `dataReencryptedAt` stamp, it can't be fooled by "the job visited this
   * user once" and a brand-new user with clean data scores zero.
   *
   * Read-only. Uses bounded per-row predicates (the encrypted-shape check is a
   * prefix-anchored regex), so even large tables are a single cheap seq scan.
   * Runs tables sequentially to avoid saturating the connection pool.
   *
   * Note: this detects PLAINTEXT-at-rest (the security gap + log-spam source).
   * It cannot tell whether an encrypted-shaped value is under the legacy global
   * key vs the per-user key — that key-rotation check still requires the
   * decrypt-based dry-run. The two are complementary.
   */
  async getHealth(): Promise<ReencryptionHealth> {
    const tables = this.getTables();
    const byColumn: ColumnHealth[] = [];
    const userTotals = new Map<string, number>();
    let rowsNeedingRemediation = 0;

    for (const table of tables) {
      const { sql, columns } = buildTableHealthQuery(table);
      const [agg] = (await this.dataSource.query(sql)) as Array<
        Record<string, number | string>
      >;
      const total = Number(agg?.total ?? 0);
      rowsNeedingRemediation += Number(agg?.rows_needing ?? 0);

      columns.forEach((col, i) => {
        const nonNull = Number(agg?.[`nn_${i}`] ?? 0);
        const encrypted = Number(agg?.[`enc_${i}`] ?? 0);
        byColumn.push({
          table: table.tableName,
          column: col.databaseName,
          total,
          nonNull,
          encrypted,
          needsRemediation: nonNull - encrypted,
          pgArrayLiteral: Number(agg?.[`pg_${i}`] ?? 0),
        });
      });

      const userRows = (await this.dataSource.query(
        buildPerUserHealthQuery(table),
      )) as Array<{ user_id: string; needs: number | string }>;
      for (const row of userRows) {
        userTotals.set(
          row.user_id,
          (userTotals.get(row.user_id) ?? 0) + Number(row.needs),
        );
      }
    }

    const [jobVisitedUsers, totalUsers] = await Promise.all([
      this.userRepository.count({
        where: { dataReencryptedAt: Not(IsNull()) },
      }),
      this.userRepository.count(),
    ]);

    const topAffectedUsers: UserHealthEntry[] = Array.from(userTotals.entries())
      .map(([userId, rows]) => ({ userId, rowsNeedingRemediation: rows }))
      .sort(
        (left, right) =>
          right.rowsNeedingRemediation - left.rowsNeedingRemediation,
      )
      .slice(0, TOP_AFFECTED_USERS_LIMIT);

    byColumn.sort(
      (left, right) =>
        right.needsRemediation - left.needsRemediation ||
        left.table.localeCompare(right.table) ||
        left.column.localeCompare(right.column),
    );

    return {
      generatedAt: new Date().toISOString(),
      scannedTables: tables.length,
      rowsNeedingRemediation,
      columnsAffected: byColumn.filter((col) => col.needsRemediation > 0)
        .length,
      byColumn,
      topAffectedUsers,
      jobVisitedUsers,
      neverVisitedUsers: totalUsers - jobVisitedUsers,
      totalUsers,
    };
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
    let rowsCleared = 0;
    const failures: ReencryptionFailureDetail[] = [];

    while (true) {
      const {
        batchScanned,
        batchRewritten,
        batchAlreadyMigrated,
        batchFailed,
        batchCleared,
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
      rowsCleared += batchCleared;
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
      rowsCleared,
      failures,
    };
  }

  /**
   * Fetch one keyset-paginated batch of a user's rows, locked `FOR UPDATE` so
   * concurrent writes from live requests serialise behind this transaction.
   */
  private async fetchBatchForUpdate(
    txMgr: EntityManager,
    table: EncryptedTable,
    userId: string,
    cursor: string | null,
  ): Promise<Array<Record<string, string | null>>> {
    const selectColumns = [
      table.primaryKeyColumn,
      ...table.columns.map((col) => col.databaseName),
    ]
      .map((name) => `"${name}"`)
      .join(", ");

    const cursorClause =
      cursor !== null ? `AND "${table.primaryKeyColumn}" > $2` : "";
    const params: unknown[] = cursor !== null ? [userId, cursor] : [userId];

    return txMgr.query(
      `SELECT ${selectColumns}
         FROM "${table.tableName}"
         WHERE "${table.userIdColumn}" = $1 ${cursorClause}
         ORDER BY "${table.primaryKeyColumn}"
         LIMIT ${BATCH_SIZE}
         FOR UPDATE`,
      params,
    );
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
    batchCleared: number;
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

    const rows = await this.fetchBatchForUpdate(txMgr, table, userId, cursor);

    let batchRewritten = 0;
    let batchAlreadyMigrated = 0;
    let batchFailed = 0;
    let batchCleared = 0;
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
          if (outcome.clearedColumns.length > 0) {
            batchCleared++;
            this.logger.warn(
              `Wiping unrecoverable column(s) [${outcome.clearedColumns.join(", ")}] ` +
                `on ${table.tableName}.${rowId} — decrypts under neither key; ` +
                `will regenerate. dryRun=${dryRun}`,
            );
          }
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
      batchCleared,
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
   * - decrypts under neither:
   *     - if the column is in CLEARABLE_ON_DECRYPT_FAILURE (regenerable/derived)
   *       → WIPE it (value = null) so migration completes; it regenerates.
   *     - otherwise → return a `failure` outcome with the column name and
   *       ciphertext (caller records a structured failure detail). Failures
   *       are *not* thrown so the per-row try/catch only handles truly
   *       unexpected exceptions.
   */
  private computeReencryptedColumns(
    table: EncryptedTable,
    row: Record<string, string | null>,
    userKey: Buffer,
    globalKey: Buffer,
  ): ReencryptColumnsResult {
    const updates: Record<string, string | null> = {};
    const clearedColumns: string[] = [];
    let anyEncryptedColumn = false;
    let anyNeedingRewrite = false;

    for (const col of table.columns) {
      const value = row[col.databaseName];
      if (value === null || value === undefined) continue;

      // Two paths share a single ColumnReencryptOutcome shape:
      //   ciphertext-shaped → reencryptCiphertextValue (legacy global → per-user)
      //   bypassed plaintext → reencryptBypassedPlaintext (e.g. pg-array `{"a","b"}`)
      const outcome = EncryptionHelper.looksLikeEncryptedPayload(value)
        ? reencryptCiphertextValue(value, col, userKey, globalKey)
        : reencryptBypassedPlaintext(value, col);

      anyEncryptedColumn = true;
      if (outcome.kind === COLUMN_REENCRYPT_OUTCOME.SKIP) continue;
      if (outcome.kind === COLUMN_REENCRYPT_OUTCOME.UPDATE) {
        updates[col.databaseName] = outcome.encrypted;
        anyNeedingRewrite = true;
        continue;
      }
      if (outcome.kind === COLUMN_REENCRYPT_OUTCOME.CLEAR) {
        updates[col.databaseName] = null;
        clearedColumns.push(col.databaseName);
        anyNeedingRewrite = true;
        continue;
      }
      return {
        kind: "rowFailure",
        failure: {
          column: col.databaseName,
          reason: outcome.reason,
          ciphertext: value,
          errorMessage: outcome.errorMessage,
        },
      };
    }

    if (!anyEncryptedColumn) return { kind: "noEncryptedValues" };
    if (!anyNeedingRewrite) return { kind: "alreadyMigrated" };
    return { kind: "rewriteNeeded", values: updates, clearedColumns };
  }

  private async applyUpdate(
    txMgr: EntityManager,
    table: EncryptedTable,
    rowId: string,
    updates: Record<string, string | null>,
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    for (const [col, value] of Object.entries(updates)) {
      // A null value means "wipe this column" — emit a literal NULL so the
      // column is cleared regardless of its storage type (a parameterised
      // `to_jsonb(NULL::text)` would store a jsonb `null`, not SQL NULL).
      if (value === null) {
        setClauses.push(`"${col}" = NULL`);
        continue;
      }
      const placeholder = `$${paramIndex++}`;
      // The ciphertext is always a plain string. For json/jsonb columns the
      // value is stored as a JSON string, so a bare ciphertext is rejected as
      // "invalid input syntax for type json" (issue #2132) — wrap it server-
      // side so the param stays a plain string. Plain text columns take it as-is.
      const storageKind =
        table.columns.find((column) => column.databaseName === col)
          ?.storageKind ?? STORAGE_KIND.TEXT;
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
