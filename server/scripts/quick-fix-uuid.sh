#!/bin/bash
# Quick fix script for UUID migration - deletes NULL userId rows

# This script connects to your database and deletes rows with NULL userId values
# Run this BEFORE restarting your server to allow TypeORM to migrate to UUIDs

echo "⚠️  WARNING: This will delete all rows with NULL userId values"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# Get database connection from .env file or use defaults
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USERNAME=${DB_USERNAME:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_NAME=${DB_NAME:-adhd_email_client}

echo "Connecting to database: $DB_NAME@$DB_HOST:$DB_PORT"

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_NAME <<EOF
-- Delete rows with NULL userId
DELETE FROM user_contexts WHERE "userId" IS NULL;
DELETE FROM priority_rules WHERE "userId" IS NULL;
DELETE FROM private_notes WHERE "userId" IS NULL;
DELETE FROM emails WHERE "userId" IS NULL;
DELETE FROM summarization_rules WHERE "userId" IS NULL;

-- Show summary
SELECT 'user_contexts' as table_name, COUNT(*) as remaining_rows FROM user_contexts
UNION ALL
SELECT 'priority_rules', COUNT(*) FROM priority_rules
UNION ALL
SELECT 'private_notes', COUNT(*) FROM private_notes
UNION ALL
SELECT 'emails', COUNT(*) FROM emails
UNION ALL
SELECT 'summarization_rules', COUNT(*) FROM summarization_rules;
EOF

echo "✅ Cleanup complete! You can now restart your server."










