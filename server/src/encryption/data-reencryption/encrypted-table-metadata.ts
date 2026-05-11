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

export interface EncryptedColumn {
  /** Database column name (quoted in raw SQL). */
  databaseName: string;
  /** True for `encryptedJsonTransformer` columns — must be JSON.parsed after decrypt. */
  isJson: boolean;
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
