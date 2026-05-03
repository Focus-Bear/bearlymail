import {
  emailTransformer,
  encryptedColumnTransformer,
  encryptedJsonTransformer,
  globalEncryptedColumnTransformer,
} from "../encryption.helper";
import { discoverEncryptedTables } from "./encrypted-table-metadata";

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
});
