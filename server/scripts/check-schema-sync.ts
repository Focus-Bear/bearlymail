/**
 * check-schema-sync.ts
 *
 * Detects drift between TypeORM entity definitions and the live database schema.
 * Exits non-zero when TypeORM would generate a non-empty migration, indicating
 * that a column/table exists in the entities but has no corresponding migration.
 *
 * Run this in CI (after migrations) to catch the class of bug fixed in #1080:
 * a column declared on an entity that was never added to the database.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/check-schema-sync.ts
 *
 * Or via package.json:
 *   npm run check:schema
 */

import dataSource from "../src/data-source";

const SCHEMA_SYNC_SCRIPT = "check-schema-sync.ts";

async function checkSchemaSync(): Promise<void> {
  console.log(`[${SCHEMA_SYNC_SCRIPT}] Initialising data source…`);
  await dataSource.initialize();

  try {
    console.log(
      `[${SCHEMA_SYNC_SCRIPT}] Comparing entity definitions to live schema…`,
    );
    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();

    const pendingQueries = sqlInMemory.upQueries;

    if (pendingQueries.length === 0) {
      console.log(
        `[${SCHEMA_SYNC_SCRIPT}] ✅ Schema is in sync — no drift detected.`,
      );
      return;
    }

    console.error(
      `[${SCHEMA_SYNC_SCRIPT}] ❌ Schema drift detected! ` +
        `${pendingQueries.length} pending SQL operation(s) would be generated:`,
    );

    pendingQueries.forEach((query, index) => {
      console.error(`  ${index + 1}. ${query.query}`);
    });

    console.error(
      `\n[${SCHEMA_SYNC_SCRIPT}] Fix: create a migration with ` +
        `\`npm run migration:generate -- src/database/migrations/YourMigrationName\` ` +
        `and commit it before deploying.`,
    );

    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

checkSchemaSync().catch((err: unknown) => {
  console.error(`[${SCHEMA_SYNC_SCRIPT}] Fatal error:`, err); // nosemgrep
  process.exit(1);
});
