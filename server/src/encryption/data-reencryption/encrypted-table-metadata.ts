import { DataSource, EntityMetadata } from "typeorm";

import {
  ENCRYPTED_TRANSFORMER_KIND,
  ENCRYPTED_TRANSFORMER_SCOPE,
  getEncryptedTransformerMeta,
} from "../encryption.helper";

/**
 * True when a TypeORM transformer encrypts under the PER-USER KMS data key
 * (so its column is in scope for per-user re-encryption). Brand-based, not
 * identity-based, so it works for both the shared singletons and the
 * per-column `make*Transformer("table.col")` factory instances.
 *
 * Global-key transformers (User entity email/name/tone) return `false`: they
 * stay readable via the global-key fallback and are out of per-user scope.
 */
export function isUserKeyTransformer(transformer: unknown): boolean {
  if (Array.isArray(transformer)) {
    return transformer.some(isUserKeyTransformer);
  }
  return (
    getEncryptedTransformerMeta(transformer)?.scope ===
    ENCRYPTED_TRANSFORMER_SCOPE.USER
  );
}

/** True when the transformer's decrypted value is JSON (must be JSON.parsed). */
function isJsonTransformer(transformer: unknown): boolean {
  if (Array.isArray(transformer)) {
    return transformer.some(isJsonTransformer);
  }
  return (
    getEncryptedTransformerMeta(transformer)?.kind ===
    ENCRYPTED_TRANSFORMER_KIND.JSON
  );
}

/**
 * Columns (`<table>.<databaseName>`) whose ciphertext is safe to WIPE when it
 * decrypts under neither the per-user KMS key nor the legacy global key.
 *
 * Re-encryption can't migrate a value it can't decrypt, so an unrecoverable
 * column normally fails the whole user (#2132). For derived/cached fields that
 * regenerate from intact source data, that's wasteful: the value is already
 * unreadable, and blocking migration on it loses nothing. So instead of
 * failing we NULL it and let the app rebuild it.
 *
 * STRICT allowlist — only add columns that:
 *   1. are auto-regenerated when empty (no user action required), and
 *   2. derive from OTHER data we still hold (so wiping loses nothing real).
 *
 * `emails.summary` is a cached LLM summary; it regenerates from the (intact)
 * email body via the GENERATE_SUMMARY job whenever `summary` is empty. NEVER
 * add user-authored columns (private notes, contexts, tone settings) — those
 * are not regenerable and must stay hard failures.
 */
export const CLEARABLE_ON_DECRYPT_FAILURE: ReadonlySet<string> =
  new Set<string>(["emails.summary"]);

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
  /**
   * When true, an unrecoverable (neither-key) ciphertext is wiped (set NULL)
   * instead of failing the user. Only set for regenerable/derived columns in
   * `CLEARABLE_ON_DECRYPT_FAILURE`.
   */
  clearOnDecryptFailure: boolean;
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
      .filter((col) => isUserKeyTransformer(col.transformer))
      .map(
        (col): EncryptedColumn => ({
          databaseName: col.databaseName,
          isJson: isJsonTransformer(col.transformer),
          storageKind: resolveStorageKind(col.type),
          clearOnDecryptFailure: CLEARABLE_ON_DECRYPT_FAILURE.has(
            `${meta.tableName}.${col.databaseName}`,
          ),
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
