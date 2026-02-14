#!/bin/bash
# check-schema-drift.sh
# Detects schema drift between TypeORM entities and the database after migrations.
# Runs migration:generate to a temp file — if any SQL is produced, entities have
# columns/tables that aren't covered by migrations. Exits non-zero on drift.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATION_DIR="$SERVER_DIR/src/database/migrations"
TEMP_MIGRATION_NAME="SchemaDriftCheck"

echo "=== Schema Drift Detection ==="
echo "Generating migration to detect entity vs database differences..."

cd "$SERVER_DIR"

# Generate a migration — if entities match the DB, TypeORM produces
# "No changes in database schema were found"
GENERATE_OUTPUT=$(npx typeorm-ts-node-commonjs migration:generate \
  "$MIGRATION_DIR/$TEMP_MIGRATION_NAME" \
  -d src/data-source.ts 2>&1) || true

# Check if a migration file was actually created
GENERATED_FILE=$(find "$MIGRATION_DIR" -name "*${TEMP_MIGRATION_NAME}*" -type f 2>/dev/null | head -1)

if [ -n "$GENERATED_FILE" ]; then
  echo ""
  echo "ERROR: Schema drift detected!"
  echo "TypeORM generated a migration, which means entities have changes not covered by migrations."
  echo ""
  echo "Generated migration contents:"
  echo "---"
  cat "$GENERATED_FILE"
  echo "---"
  echo ""
  echo "To fix: Run 'npm run migration:generate src/database/migrations/DescriptiveName' locally,"
  echo "review the generated migration, and commit it."
  echo ""

  # Clean up the generated file
  rm -f "$GENERATED_FILE"

  exit 1
else
  echo "No schema drift detected. Entities and migrations are in sync."
  exit 0
fi
