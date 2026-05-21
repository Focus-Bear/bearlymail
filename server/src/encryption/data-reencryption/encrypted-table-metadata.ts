import { DataSource, EntityMetadata } from "typeorm";

import {
  emailTransformer,
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../encryption.helper";

export const USER_KEY_TRANSFORMERS: ReadonlySet<unknown> = new Set<unknown>([
  encryptedColumnTransformer,
  encryptedJsonTransformer,
  emailTransformer,
]);

export interface EncryptedTable {
  tableName: string;
  primaryKeyColumn: string;
  userIdColumn: string;
  columns: EncryptedColumn[];
}

/**
 * Postgres storage type for an encrypted column, as it affects raw-SQL writes:
 * - `jsonb` / `json` columns store the ciphertext as a JSON string, so a raw
 *   UPDATE must JSON-encode it (`to_jsonb($n::text)`). Passing a bare
 *   ciphertext string fails with "invalid input syntax for type json" — the
 *   root cause behind the re-encryption failures in issue #2132.
 * - `text` covers every plain text/varchar column, which takes the ciphertext
 *   string directly.
 *
 * Note this is the DB column type, NOT the transformer. A column can use
 * `encryptedJsonTransformer` (its decrypted value is JSON) yet still be stored
 * as `text` — most are. Only `jsonb`/`json` columns need the JSON wrapping.
 */
export const STORAGE_KIND = {
  JSONB: "jsonb",
  JSON: "json",
  TEXT: "text",
} as const;

export type JsonStorageKind = (typeof STORAGE_KIND)[keyof typeof STORAGE_KIND];

export interface EncryptedColumn {
  /** Database column name (quoted in raw SQL). */
  databaseName: string;
  /** True for `encryptedJsonTransformer` columns — must be JSON.parsed after decrypt. */
  isJson: boolean;
  /** Postgres storage type — determines how a raw-SQL write must encode the value. */
  storageKind: JsonStorageKind;
}

/**
 * Walks `dataSource.entityMetadatas` and returns every entity that
 *   (a) has at least one column whose transformer uses the per-user data key, and
 *   (b) has a direct `userId` column.
 *
 * Entities scoped indirectly (via contactId, organizationId, etc.) are excluded —
 * they remain readable via the global-key fallback in tryDecrypt and will need
 * separate handling if/when those tables migrate too.
 */
export function discoverEncryptedTables(
  dataSource: DataSource,
): EncryptedTable[] {
  const tables: EncryptedTable[] = [];

  for (const meta of dataSource.entityMetadatas) {
    const userIdColumn = findUserIdColumn(meta);
    if (!userIdColumn) continue;

    const primaryKey = meta.primaryColumns[0];
    if (!primaryKey) continue;

    const encryptedColumns = meta.columns
      .filter((col) => USER_KEY_TRANSFORMERS.has(col.transformer))
      .map(
        (col): EncryptedColumn => ({
          databaseName: col.databaseName,
          isJson: col.transformer === encryptedJsonTransformer,
          storageKind: resolveStorageKind(col.type),
        }),
      );

    if (encryptedColumns.length === 0) continue;

    tables.push({
      tableName: meta.tableName,
      primaryKeyColumn: primaryKey.databaseName,
      userIdColumn: userIdColumn.databaseName,
      columns: encryptedColumns,
    });
  }

  return tables;
}

function findUserIdColumn(meta: EntityMetadata) {
  return meta.columns.find(
    (col) => col.databaseName === "userId" || col.propertyName === "userId",
  );
}

/**
 * Normalise a TypeORM column type into the storage kinds that matter for raw
 * SQL writes. `col.type` is a string for explicitly-typed columns (e.g.
 * `"jsonb"`, `"text"`) but can be a constructor (e.g. `String`) for inferred
 * ones — anything we don't recognise as JSON is treated as plain text.
 */
function resolveStorageKind(type: unknown): JsonStorageKind {
  const normalised = typeof type === "string" ? type.toLowerCase() : "";
  if (normalised === STORAGE_KIND.JSONB) return STORAGE_KIND.JSONB;
  if (normalised === STORAGE_KIND.JSON) return STORAGE_KIND.JSON;
  return STORAGE_KIND.TEXT;
}
