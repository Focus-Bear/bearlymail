import {
  EncryptedColumn,
  EncryptedTable,
  STORAGE_KIND,
} from "./encrypted-table-metadata";
import {
  buildColumnPredicates,
  buildPerUserHealthQuery,
  buildTableHealthQuery,
  ENCRYPTED_SHAPE_SQL_REGEX,
} from "./reencryption-health";

function textCol(name: string): EncryptedColumn {
  return {
    databaseName: name,
    isJson: false,
    storageKind: STORAGE_KIND.TEXT,
    clearOnDecryptFailure: false,
  };
}

function jsonbCol(name: string): EncryptedColumn {
  return {
    databaseName: name,
    isJson: true,
    storageKind: STORAGE_KIND.JSONB,
    clearOnDecryptFailure: false,
  };
}

describe("buildColumnPredicates", () => {
  it("uses a prefix-anchored encrypted-shape regex on the raw column for text storage", () => {
    const pred = buildColumnPredicates(textCol("labels"));
    expect(pred.nonNull).toBe(`"labels" IS NOT NULL`);
    expect(pred.encrypted).toBe(`"labels" ~ '${ENCRYPTED_SHAPE_SQL_REGEX}'`);
    // pg-array literal detection — the labels-bug shape `{"INBOX",...}`
    expect(pred.pgArray).toBe(`"labels" LIKE '{"%'`);
  });

  it("unwraps jsonb storage with #>> '{}' and detects bypassed array/object via jsonb_typeof", () => {
    const pred = buildColumnPredicates(jsonbCol("metadata"));
    expect(pred.encrypted).toContain(
      `jsonb_typeof("metadata"::jsonb) = 'string'`,
    );
    expect(pred.encrypted).toContain(
      `("metadata" #>> '{}') ~ '${ENCRYPTED_SHAPE_SQL_REGEX}'`,
    );
    expect(pred.pgArray).toBe(
      `jsonb_typeof("metadata"::jsonb) IN ('array', 'object')`,
    );
  });

  it("anchors the regex so only the value prefix is scanned (cheap on large bodies)", () => {
    expect(ENCRYPTED_SHAPE_SQL_REGEX.startsWith("^")).toBe(true);
    // 32 hex IV + colon + 32 hex tag + colon
    expect(ENCRYPTED_SHAPE_SQL_REGEX).toBe("^[0-9a-f]{32}:[0-9a-f]{32}:");
  });
});

describe("buildTableHealthQuery", () => {
  const table: EncryptedTable = {
    tableName: "emails",
    primaryKeyColumn: "id",
    userIdColumn: "userId",
    columns: [textCol("labels"), textCol("subject")],
  };

  it("returns one aggregate query with per-column aliases and a rows_needing total", () => {
    const { sql, columns } = buildTableHealthQuery(table);
    expect(columns).toHaveLength(2);
    expect(sql).toContain("count(*)::int AS total");
    // per-column aliases, indexed
    expect(sql).toContain("AS nn_0");
    expect(sql).toContain("AS enc_0");
    expect(sql).toContain("AS pg_0");
    expect(sql).toContain("AS nn_1");
    expect(sql).toContain("AS enc_1");
    expect(sql).toContain("AS rows_needing");
    expect(sql).toContain(`FROM "emails"`);
  });

  it("rows_needing ORs the per-column not-encrypted predicates (counts each row once)", () => {
    const { sql } = buildTableHealthQuery(table);
    const rowsNeedingClause = sql.slice(sql.indexOf("rows_needing") - 200);
    // both columns participate in the OR
    expect(sql).toContain(" OR ");
    expect(rowsNeedingClause).toContain("rows_needing");
  });
});

describe("buildPerUserHealthQuery", () => {
  it("groups by the user-id column and counts rows with any plaintext-at-rest column", () => {
    const table: EncryptedTable = {
      tableName: "private_notes",
      primaryKeyColumn: "id",
      userIdColumn: "userId",
      columns: [textCol("content")],
    };
    const sql = buildPerUserHealthQuery(table);
    expect(sql).toContain(`"userId"::text AS user_id`);
    expect(sql).toContain(`count(*)::int AS needs`);
    expect(sql).toContain(`FROM "private_notes"`);
    expect(sql).toContain(`GROUP BY "userId"`);
    // not-encrypted predicate present
    expect(sql).toContain(`"content" IS NOT NULL AND NOT`);
  });
});
