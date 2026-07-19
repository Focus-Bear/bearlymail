import { getMetadataArgsStorage } from "typeorm";

import { ActionItem } from "../../database/entities/action-item.entity";
import { Email } from "../../database/entities/email.entity";
import { EmailThread } from "../../database/entities/email-thread.entity";
import { GoogleAccount } from "../../database/entities/google-account.entity";
import { Office365Account } from "../../database/entities/office365-account.entity";
import { PrivateNote } from "../../database/entities/private-note.entity";
import { ProtoCategory } from "../../database/entities/proto-category.entity";
import { SummarizationRule } from "../../database/entities/summarization-rule.entity";
import { UserContext } from "../../database/entities/user-context.entity";
import { ZohoAccount } from "../../database/entities/zoho-account.entity";
import {
  emailTransformer,
  encryptedColumnTransformer,
  encryptedJsonTransformer,
  globalEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../encryption.helper";
import {
  discoverEncryptedTables,
  isUserKeyTransformer,
} from "./encrypted-table-metadata";

function fakeDataSource(entityMetadatas: unknown[]) {
  return { entityMetadatas } as never;
}

describe("discoverEncryptedTables", () => {
  it("includes entities with userId column and per-user-key encrypted columns", () => {
    const meta = {
      tableName: "emails",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "subject",
          propertyName: "subject",
          transformer: encryptedColumnTransformer,
        },
        {
          databaseName: "labels",
          propertyName: "labels",
          transformer: encryptedJsonTransformer,
        },
        {
          databaseName: "from",
          propertyName: "from",
          transformer: emailTransformer,
        },
      ],
    };

    const tables = discoverEncryptedTables(fakeDataSource([meta]));

    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({
      tableName: "emails",
      primaryKeyColumn: "id",
      userIdColumn: "userId",
    });
    expect(tables[0].columns.map((col) => col.databaseName).sort()).toEqual([
      "from",
      "labels",
      "subject",
    ]);
    expect(
      tables[0].columns.find((col) => col.databaseName === "labels")?.isJson,
    ).toBe(true);
    expect(
      tables[0].columns.find((col) => col.databaseName === "subject")?.isJson,
    ).toBe(false);
  });

  it("discovers per-column factory transformers (field-labelled) just like the singletons", () => {
    // The migration to make*Transformer("table.col") must NOT drop a column
    // from re-encryption scope — discovery is brand-based, not identity-based.
    const meta = {
      tableName: "emails",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "labels",
          propertyName: "labels",
          transformer: makeEncryptedJsonTransformer("emails.labels"),
        },
      ],
    };

    const [table] = discoverEncryptedTables(fakeDataSource([meta]));
    const labels = table.columns.find((col) => col.databaseName === "labels");
    expect(labels).toBeDefined();
    expect(labels?.isJson).toBe(true);
  });

  it("excludes entities without a userId column", () => {
    const meta = {
      tableName: "waitlist",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "email",
          propertyName: "email",
          transformer: encryptedColumnTransformer,
        },
      ],
    };

    expect(discoverEncryptedTables(fakeDataSource([meta]))).toEqual([]);
  });

  it("excludes entities whose only encrypted columns use the global-key transformer", () => {
    const meta = {
      tableName: "users",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "totpSecret",
          propertyName: "totpSecret",
          transformer: globalEncryptedColumnTransformer,
        },
      ],
    };

    expect(discoverEncryptedTables(fakeDataSource([meta]))).toEqual([]);
  });

  it("excludes entities with userId but no encrypted columns", () => {
    const meta = {
      tableName: "scheduled_emails",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        { databaseName: "scheduledFor", transformer: undefined },
      ],
    };

    expect(discoverEncryptedTables(fakeDataSource([meta]))).toEqual([]);
  });

  it("records the Postgres storage kind so jsonb columns get JSON-encoded on write (issue #2132)", () => {
    // context_analyses.stats is `jsonb` + encryptedJsonTransformer — a raw
    // UPDATE with a bare ciphertext string fails with "invalid input syntax
    // for type json". The metadata must flag it so applyUpdate wraps the value.
    const meta = {
      tableName: "context_analyses",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "stats",
          propertyName: "stats",
          type: "jsonb",
          transformer: encryptedJsonTransformer,
        },
        {
          databaseName: "errorMessage",
          propertyName: "errorMessage",
          type: "text",
          transformer: encryptedColumnTransformer,
        },
      ],
    };

    const [table] = discoverEncryptedTables(fakeDataSource([meta]));

    expect(
      table.columns.find((col) => col.databaseName === "stats")?.storageKind,
    ).toBe("jsonb");
    expect(
      table.columns.find((col) => col.databaseName === "errorMessage")
        ?.storageKind,
    ).toBe("text");
  });

  it("treats columns with an inferred (non-string) type as plain text", () => {
    const meta = {
      tableName: "private_notes",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "content",
          propertyName: "content",
          // TypeORM stores a constructor (e.g. String) for inferred types.
          type: String,
          transformer: encryptedColumnTransformer,
        },
      ],
    };

    const [table] = discoverEncryptedTables(fakeDataSource([meta]));

    expect(
      table.columns.find((col) => col.databaseName === "content")?.storageKind,
    ).toBe("text");
  });

  it("flags only allowlisted columns as clearOnDecryptFailure (#2132)", () => {
    // emails.summary is a regenerable LLM cache → clearable; emails.body is
    // source data → must NOT be auto-wiped.
    const meta = {
      tableName: "emails",
      primaryColumns: [{ databaseName: "id" }],
      columns: [
        { databaseName: "id", propertyName: "id", transformer: undefined },
        {
          databaseName: "userId",
          propertyName: "userId",
          transformer: undefined,
        },
        {
          databaseName: "summary",
          propertyName: "summary",
          type: "text",
          transformer: encryptedColumnTransformer,
        },
        {
          databaseName: "body",
          propertyName: "body",
          type: "text",
          transformer: encryptedColumnTransformer,
        },
      ],
    };

    const [table] = discoverEncryptedTables(fakeDataSource([meta]));

    expect(
      table.columns.find((col) => col.databaseName === "summary")
        ?.clearOnDecryptFailure,
    ).toBe(true);
    expect(
      table.columns.find((col) => col.databaseName === "body")
        ?.clearOnDecryptFailure,
    ).toBe(false);
  });
});

/**
 * Regression for #1700: a circular import (encryption.helper → category-name.util →
 * user-context.entity → encryption.helper) caused @Column decorators on entities
 * loaded mid-cycle to receive `transformer: undefined`, silently excluding their
 * tables from re-encryption discovery. This asserts the raw decorator arguments
 * captured by TypeORM's MetadataArgsStorage retain the real transformer reference
 * for every hot user-scoped entity.
 */
describe("entity @Column transformer captures (issue #1700)", () => {
  const cases: Array<{ entity: unknown; name: string }> = [
    { name: "Email", entity: Email },
    { name: "EmailThread", entity: EmailThread },
    { name: "UserContext", entity: UserContext },
    { name: "ActionItem", entity: ActionItem },
    { name: "PrivateNote", entity: PrivateNote },
    { name: "SummarizationRule", entity: SummarizationRule },
    { name: "ProtoCategory", entity: ProtoCategory },
    { name: "GoogleAccount", entity: GoogleAccount },
    { name: "Office365Account", entity: Office365Account },
    { name: "ZohoAccount", entity: ZohoAccount },
  ];

  it.each(cases)(
    "$name has at least one column whose @Column captured a real per-user transformer",
    ({ entity }) => {
      const cols = getMetadataArgsStorage().columns.filter(
        (col) => col.target === entity,
      );
      const withRealTransformer = cols.filter((col) =>
        isUserKeyTransformer(
          (col.options as { transformer?: unknown })?.transformer,
        ),
      );
      expect(withRealTransformer.length).toBeGreaterThan(0);
    },
  );
});
