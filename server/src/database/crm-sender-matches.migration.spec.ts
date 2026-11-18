import { getMetadataArgsStorage, QueryRunner } from "typeorm";

import { CrmSenderMatch } from "./entities/crm-sender-match.entity";
import { AddCrmSenderMatches1797865000000 } from "./migrations/1797865000000-AddCrmSenderMatches";

const TABLE = "crm_sender_matches";
const UNIQUE_INDEX = "IDX_crm_sender_matches_userId_serverId_emailHash";

/** A QueryRunner that records the SQL a migration issues, without a database. */
function recordingQueryRunner() {
  const statements: string[] = [];
  const runner = {
    query: jest.fn((sql: string) => {
      statements.push(sql.replace(/\s+/g, " ").trim());
      return Promise.resolve();
    }),
  };
  return { statements, runner: runner as unknown as QueryRunner };
}

const entityColumnNames = () =>
  getMetadataArgsStorage()
    .columns.filter((column) => column.target === CrmSenderMatch)
    .map((column) => column.propertyName);

describe("AddCrmSenderMatches migration", () => {
  const migration = new AddCrmSenderMatches1797865000000();

  it("creates a column for every entity column", async () => {
    const { statements, runner } = recordingQueryRunner();

    await migration.up(runner);

    const createTable = statements.find((sql) =>
      sql.startsWith(`CREATE TABLE "${TABLE}"`),
    );
    expect(createTable).toBeDefined();
    const missing = entityColumnNames().filter(
      (name) => !createTable?.includes(`"${name}"`),
    );
    expect(missing).toEqual([]);
  });

  it("cascades deletes from the user and the CRM connection", async () => {
    const { statements, runner } = recordingQueryRunner();

    await migration.up(runner);

    const createTable = statements.join("\n");
    expect(createTable).toContain(
      `FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    expect(createTable).toContain(
      `FOREIGN KEY ("serverId") REFERENCES "mcp_server_configs"("id") ON DELETE CASCADE`,
    );
  });

  it("adds the unique (user, connection, sender) index the entity and upsert rely on", async () => {
    const { statements, runner } = recordingQueryRunner();

    await migration.up(runner);

    expect(statements).toContain(
      `CREATE UNIQUE INDEX "${UNIQUE_INDEX}" ON "${TABLE}" ("userId", "serverId", "emailHash")`,
    );
    const entityIndex = getMetadataArgsStorage().indices.find(
      (index) => index.target === CrmSenderMatch,
    );
    expect(entityIndex).toMatchObject({ name: UNIQUE_INDEX, unique: true });
  });

  it("down drops the index and then the table", async () => {
    const { statements, runner } = recordingQueryRunner();

    await migration.down(runner);

    expect(statements).toEqual([
      `DROP INDEX "${UNIQUE_INDEX}"`,
      `DROP TABLE "${TABLE}"`,
    ]);
  });
});
