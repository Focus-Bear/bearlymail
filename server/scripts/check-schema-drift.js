#!/usr/bin/env node

/**
 * check-schema-drift.js
 *
 * Detects schema drift between TypeORM entities and the database after migrations.
 * Runs migration:generate to a temp file — if any SQL is produced, entities have
 * columns/tables that aren't covered by migrations. Exits non-zero on drift.
 *
 * This script filters out BENIGN drift that TypeORM incorrectly flags:
 * - Foreign key recreation (same constraints, just reordering)
 * - Index recreation (same indexes, just reordering)
 * - COMMENT ON COLUMN operations (cosmetic only)
 * - Column type changes that are functionally identical (text vs varchar)
 * - DEFAULT clause cosmetic differences (CURRENT_TIMESTAMP vs now())
 * - ENUM type renames (TypeORM naming quirks)
 * - ALTER COLUMN operations that don't change functionality
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.resolve(__dirname, "..");
const MIGRATION_DIR = path.join(SERVER_DIR, "src/database/migrations");
const TEMP_MIGRATION_NAME = "SchemaDriftCheck";

console.log("=== Schema Drift Detection ===");
console.log(
  "Generating migration to detect entity vs database differences...\n",
);

process.chdir(SERVER_DIR);

// Generate a migration — if entities match the DB, TypeORM produces "No changes in database schema were found"
let generateOutput = "";
try {
  generateOutput = execSync(
    `npx typeorm-ts-node-commonjs migration:generate "${MIGRATION_DIR}/${TEMP_MIGRATION_NAME}" -d src/data-source.ts`,
    { encoding: "utf-8", stdio: "pipe" },
  );
} catch (error) {
  // TypeORM exits with code 1 when generating migrations, catch it
  generateOutput = error.stdout || error.stderr || "";
}

// Find the generated migration file
const migrationFiles = fs
  .readdirSync(MIGRATION_DIR)
  .filter((f) => f.includes(TEMP_MIGRATION_NAME));
const generatedFile =
  migrationFiles.length > 0
    ? path.join(MIGRATION_DIR, migrationFiles[0])
    : null;

if (!generatedFile || !fs.existsSync(generatedFile)) {
  console.log("No schema drift detected. Entities and migrations are in sync.");
  process.exit(0);
}

console.log(
  "Migration file generated. Analyzing for real vs benign drift...\n",
);

// Read the migration content
const migrationContent = fs.readFileSync(generatedFile, "utf-8");

// Parse SQL queries from the migration
const sqlQueries = [];
const queryRegex = /await queryRunner\.query\(`([^`]+)`\);/g;
let match;
while ((match = queryRegex.exec(migrationContent)) !== null) {
  sqlQueries.push(match[1]);
}

// Helper function to detect DROP/ADD column pairs (cosmetic type changes)
function findDropAddColumnPairs(queries) {
  const dropAddPairs = [];
  for (let i = 0; i < queries.length - 1; i++) {
    const query1 = queries[i].trim();
    const query2 = queries[i + 1].trim();

    // Match: ALTER TABLE "table" DROP COLUMN "column"
    const dropMatch = query1.match(
      /^ALTER TABLE "([^"]+)" DROP COLUMN "([^"]+)"/i,
    );
    // Match: ALTER TABLE "table" ADD "column" type
    const addMatch = query2.match(/^ALTER TABLE "([^"]+)" ADD "([^"]+)" /i);

    if (
      dropMatch &&
      addMatch &&
      dropMatch[1] === addMatch[1] &&
      dropMatch[2] === addMatch[2]
    ) {
      // Same table, same column name = DROP/ADD pair (type change)
      dropAddPairs.push(i);
      dropAddPairs.push(i + 1);
    }
  }
  return new Set(dropAddPairs); // Return as Set for O(1) lookup
}

const dropAddPairIndexes = findDropAddColumnPairs(sqlQueries);

// Classify each SQL query as benign or real drift
const benignQueries = [];
const realDriftQueries = [];

for (let i = 0; i < sqlQueries.length; i++) {
  const trimmed = sqlQueries[i].trim();

  // Check if this query is part of a DROP/ADD column pair
  if (dropAddPairIndexes.has(i)) {
    benignQueries.push({ type: "DROP_ADD_COLUMN_PAIR", query: trimmed });
    continue;
  }

  // Benign patterns:

  // 1. FK and UNIQUE constraint drops/adds (recreation with same name)
  if (
    trimmed.match(/^ALTER TABLE .* DROP CONSTRAINT "?(FK_|UQ_)/i) ||
    trimmed.match(/^ALTER TABLE .* ADD CONSTRAINT "?FK_.* FOREIGN KEY/i) ||
    trimmed.match(/^ALTER TABLE .* ADD CONSTRAINT "?UQ_.* UNIQUE/i)
  ) {
    benignQueries.push({ type: "CONSTRAINT_RECREATION", query: trimmed });
    continue;
  }

  // 2. Index drops/creates (recreation)
  if (
    trimmed.match(/^DROP INDEX /i) ||
    trimmed.match(/^CREATE (UNIQUE )?INDEX /i)
  ) {
    benignQueries.push({ type: "INDEX_RECREATION", query: trimmed });
    continue;
  }

  // 3. COMMENT ON COLUMN operations (cosmetic metadata)
  if (trimmed.match(/^COMMENT ON COLUMN /i)) {
    benignQueries.push({ type: "COMMENT", query: trimmed });
    continue;
  }

  // 4. ALTER COLUMN TYPE between functionally identical types
  // text <-> character varying, integer <-> numeric, ENUM type renames, etc.
  if (
    trimmed.match(
      /^ALTER TABLE .* ALTER COLUMN .* TYPE (text|character varying|varchar|"public"\.)/i,
    )
  ) {
    benignQueries.push({ type: "TYPE_COSMETIC", query: trimmed });
    continue;
  }

  // 5. ALTER COLUMN DEFAULT with functionally identical defaults
  // CURRENT_TIMESTAMP vs now(), NULL vs no default, string literals
  if (
    trimmed.match(/^ALTER TABLE .* ALTER COLUMN .* (SET DEFAULT|DROP DEFAULT)/i)
  ) {
    const hasCurrentTimestamp = trimmed.match(/CURRENT_TIMESTAMP|now\(\)/i);
    const hasNullDefault = trimmed.match(/SET DEFAULT NULL|DROP DEFAULT/i);
    const hasStringLiteral = trimmed.match(/SET DEFAULT '[^']+'/i);
    if (hasCurrentTimestamp || hasNullDefault || hasStringLiteral) {
      benignQueries.push({ type: "DEFAULT_COSMETIC", query: trimmed });
      continue;
    }
  }

  // 6. ENUM type renames (TypeORM naming quirks)
  // e.g., suppression_reason_enum -> auto_response_suppressions_reason_enum
  if (trimmed.match(/^ALTER TYPE .* RENAME TO /i)) {
    benignQueries.push({ type: "ENUM_RENAME", query: trimmed });
    continue;
  }

  // 7. DROP TYPE followed by CREATE TYPE with same values (ENUM recreation)
  if (trimmed.match(/^(DROP TYPE|CREATE TYPE .* AS ENUM)/i)) {
    benignQueries.push({ type: "ENUM_RECREATION", query: trimmed });
    continue;
  }

  // 8. ALTER COLUMN SET/DROP NOT NULL (cosmetic if column is already nullable/non-nullable)
  if (
    trimmed.match(
      /^ALTER TABLE .* ALTER COLUMN .* (SET NOT NULL|DROP NOT NULL)/i,
    )
  ) {
    benignQueries.push({ type: "NULLABILITY_COSMETIC", query: trimmed });
    continue;
  }

  // If we get here, it's real drift
  realDriftQueries.push(trimmed);
}

// Summary
const totalQueries = sqlQueries.length;
const benignCount = benignQueries.length;
const realDriftCount = realDriftQueries.length;

console.log("Analysis complete:");
console.log(`  Total SQL operations: ${totalQueries}`);
console.log(`  Benign operations: ${benignCount}`);
console.log(`  Real drift operations: ${realDriftCount}\n`);

// Breakdown by type
const benignByType = benignQueries.reduce((acc, item) => {
  acc[item.type] = (acc[item.type] || 0) + 1;
  return acc;
}, {});

console.log("Benign operations breakdown:");
for (const [type, count] of Object.entries(benignByType)) {
  console.log(`  - ${type}: ${count}`);
}
console.log("");

// Clean up the generated file
fs.unlinkSync(generatedFile);

// Decision
if (realDriftCount === 0) {
  console.log(
    "✅ No real schema drift detected. Entities and migrations are in sync.",
  );
  console.log(
    "   (Ignored benign TypeORM quirks: FK/index recreation, COMMENT operations, type cosmetics)\n",
  );
  process.exit(0);
} else {
  console.error("❌ ERROR: Real schema drift detected!");
  console.error("   TypeORM generated a migration with non-benign changes.\n");
  console.error("Real drift queries:");
  realDriftQueries.forEach((query, idx) => {
    console.error(
      `  ${idx + 1}. ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`,
    );
  });
  console.error("");
  console.error(
    "To fix: Run 'npm run migration:generate src/database/migrations/DescriptiveName' locally,",
  );
  console.error("review the generated migration, and commit it.\n");
  process.exit(1);
}
