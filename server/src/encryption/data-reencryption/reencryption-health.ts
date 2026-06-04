import {
  EncryptedColumn,
  EncryptedTable,
  STORAGE_KIND,
} from "./encrypted-table-metadata";

/**
 * Health of a single encrypted column: how its stored values are actually
 * shaped on disk, independent of whether any migration job has "run".
 *
 * This is the honest signal the admin dashboard was missing — the
 * `users.dataReencryptedAt` stamp only records that the job *visited* a user,
 * not that every value is encrypted at rest. A value that bypassed the column
 * transformer (e.g. a Postgres array literal `{"INBOX","IMPORTANT"}` written by
 * a legacy `repository.update()` call) sits in the column as PLAINTEXT and is
 * the source of the `failed to parse decrypted JSON` log spam.
 */
export interface ColumnHealth {
  table: string;
  column: string;
  /** Total rows in the table (same for every column of the table). */
  total: number;
  /** Rows where this column is non-null. */
  nonNull: number;
  /** Non-null rows whose value is encrypted-shaped (`<32hex>:<32hex>:…`). */
  encrypted: number;
  /** Non-null rows that are NOT encrypted-shaped — i.e. plaintext at rest. */
  needsRemediation: number;
  /** Subset of needsRemediation that is specifically a Postgres array literal (`{"…"}`). */
  pgArrayLiteral: number;
}

export interface UserHealthEntry {
  userId: string;
  /** Distinct rows owned by this user with ≥1 plaintext-at-rest encrypted column. */
  rowsNeedingRemediation: number;
}

export interface ReencryptionHealth {
  /** ISO timestamp the scan was taken (set by the caller). */
  generatedAt: string;
  scannedTables: number;
  /**
   * THE headline: distinct rows (across all encrypted tables) holding ≥1
   * plaintext-at-rest value. This is what actually needs remediation — unlike
   * "pending users", a freshly-registered user with no bypassed rows scores 0.
   */
  rowsNeedingRemediation: number;
  /** Number of (table,column) pairs with ≥1 plaintext-at-rest value. */
  columnsAffected: number;
  /** Per-column breakdown, sorted by needsRemediation desc then table/column. */
  byColumn: ColumnHealth[];
  /** Up to 10 users with the most rows needing remediation. */
  topAffectedUsers: UserHealthEntry[];
  /** Users with `dataReencryptedAt` set — i.e. the job has visited them at least once. */
  jobVisitedUsers: number;
  /** Users never visited by the re-encryption job. */
  neverVisitedUsers: number;
  totalUsers: number;
}

/**
 * Postgres regex matching an encrypted value's prefix: a 16-byte IV (32 hex
 * chars), `:`, a 16-byte GCM tag (32 hex chars), `:`. Anchored at the start so
 * the engine examines only the first ~66 chars regardless of the value's total
 * length — cheap even on multi-MB `body`/`htmlBody` columns. Mirrors
 * `EncryptionHelper.looksLikeEncryptedPayload` (3 colon-parts, 16-byte IV).
 */
export const ENCRYPTED_SHAPE_SQL_REGEX = "^[0-9a-f]{32}:[0-9a-f]{32}:";

interface ColumnPredicates {
  nonNull: string;
  encrypted: string;
  pgArray: string;
}

/**
 * SQL boolean fragments classifying a single column's stored value. Table and
 * column names come from TypeORM entity metadata (never user input), so direct
 * interpolation is safe.
 *
 * For `jsonb`/`json` columns the ciphertext is stored as a JSON *string*
 * (`to_jsonb(text)`), so we unwrap with `#>> '{}'` before the regex. A bypassed
 * write on a jsonb column produces a real jsonb array/object instead, which we
 * detect via `jsonb_typeof` and treat as not-encrypted (needs remediation).
 */
export function buildColumnPredicates(col: EncryptedColumn): ColumnPredicates {
  const name = `"${col.databaseName}"`;
  const isJsonStorage =
    col.storageKind === STORAGE_KIND.JSONB ||
    col.storageKind === STORAGE_KIND.JSON;

  if (!isJsonStorage) {
    return {
      nonNull: `${name} IS NOT NULL`,
      encrypted: `${name} ~ '${ENCRYPTED_SHAPE_SQL_REGEX}'`,
      pgArray: `${name} LIKE '{"%'`,
    };
  }

  const asText = `(${name} #>> '{}')`;
  const typeOf = `jsonb_typeof(${name}::jsonb)`;
  return {
    nonNull: `${name} IS NOT NULL`,
    // Encrypted-shaped only if it's a jsonb string AND the unwrapped text matches.
    encrypted: `${typeOf} = 'string' AND ${asText} ~ '${ENCRYPTED_SHAPE_SQL_REGEX}'`,
    // A bypassed jsonb write lands as a jsonb array/object, never a string.
    pgArray: `${typeOf} IN ('array', 'object')`,
  };
}

/** `(present AND NOT encrypted-shaped)` — i.e. plaintext at rest. */
function needsRemediationExpr(pred: ColumnPredicates): string {
  return `(${pred.nonNull} AND NOT (${pred.encrypted}))`;
}

/**
 * One aggregate query returning, for the whole table: total rows, per-column
 * non-null/encrypted/pg-array counts, and the distinct count of rows needing
 * remediation (any column). `columns` gives the index→column mapping for the
 * `nn_<i>` / `enc_<i>` / `pg_<i>` result aliases.
 */
export function buildTableHealthQuery(table: EncryptedTable): {
  sql: string;
  columns: EncryptedColumn[];
} {
  const selects: string[] = ["count(*)::int AS total"];
  const needsExprs: string[] = [];

  table.columns.forEach((col, i) => {
    const pred = buildColumnPredicates(col);
    selects.push(`count(*) FILTER (WHERE ${pred.nonNull})::int AS nn_${i}`);
    selects.push(
      `count(*) FILTER (WHERE ${pred.nonNull} AND (${pred.encrypted}))::int AS enc_${i}`,
    );
    selects.push(
      `count(*) FILTER (WHERE ${needsRemediationExpr(pred)} AND (${pred.pgArray}))::int AS pg_${i}`,
    );
    needsExprs.push(needsRemediationExpr(pred));
  });

  selects.push(
    `count(*) FILTER (WHERE ${needsExprs.join(" OR ")})::int AS rows_needing`,
  );

  const sql = `SELECT ${selects.join(", ")} FROM "${table.tableName}"`;
  return { sql, columns: table.columns };
}

/**
 * Per-user count of rows in this table with ≥1 plaintext-at-rest column.
 * Result rows: `{ user_id, needs }`.
 */
export function buildPerUserHealthQuery(table: EncryptedTable): string {
  const needsExprs = table.columns.map((col) =>
    needsRemediationExpr(buildColumnPredicates(col)),
  );
  return (
    `SELECT "${table.userIdColumn}"::text AS user_id, count(*)::int AS needs ` +
    `FROM "${table.tableName}" ` +
    `WHERE ${needsExprs.join(" OR ")} ` +
    `GROUP BY "${table.userIdColumn}"`
  );
}
